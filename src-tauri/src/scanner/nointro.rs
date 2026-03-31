//! No-Intro DAT file parser and CRC32 lookup database.
//!
//! Parses No-Intro XML DAT files (standard `<datafile>` format) using
//! quick-xml's event-based reader. Builds an in-memory lookup table keyed
//! by CRC32 hash so scanned ROMs can be matched to their canonical names.

use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::db::Database;

/// Known region keywords used in No-Intro naming conventions.
const REGIONS: &[&str] = &[
    "USA", "Europe", "Japan", "World", "Australia", "Brazil", "Canada",
    "China", "France", "Germany", "Hong Kong", "Italy", "Korea",
    "Netherlands", "Russia", "Spain", "Sweden", "Taiwan", "UK", "Asia",
];

/// A single ROM entry parsed from a No-Intro DAT file.
#[derive(Debug, Clone)]
pub struct NoIntroEntry {
    /// Canonical game name from the DAT file.
    pub name: String,
    /// CRC32 hash as a lowercase 8-character hex string.
    pub crc32: String,
    /// SHA1 hash as a lowercase 40-character hex string, if present.
    pub sha1: Option<String>,
    /// ROM file size in bytes, if present.
    pub size: Option<u64>,
    /// Region parsed from the game name (e.g. "USA", "Europe").
    pub region: Option<String>,
}

/// Parsed metadata from the DAT file's `<header>` element.
#[derive(Debug, Clone)]
pub struct DatFileInfo {
    /// The `<name>` value from the DAT header (e.g. "Nintendo - NES").
    pub name: String,
    /// Total number of ROM entries parsed from the file.
    pub entry_count: usize,
}

/// Result of loading a DAT file: header info plus a CRC32 lookup table.
pub struct NoIntroDat {
    pub info: DatFileInfo,
    /// Map from lowercase CRC32 hex string to the corresponding entry.
    pub entries: HashMap<String, NoIntroEntry>,
}

/// Aggregated lookup across all loaded DAT files.
///
/// Keyed by `system_id` -> CRC32 -> `NoIntroEntry`.
#[derive(Clone)]
pub struct NoIntroDatabase {
    pub systems: HashMap<String, HashMap<String, NoIntroEntry>>,
}

impl NoIntroDatabase {
    /// Creates an empty No-Intro database.
    pub fn new() -> Self {
        Self {
            systems: HashMap::new(),
        }
    }

    /// Looks up a ROM entry by system ID and CRC32 hash.
    ///
    /// The `crc32` value is compared in lowercase.
    pub fn lookup(&self, system_id: &str, crc32: &str) -> Option<&NoIntroEntry> {
        self.systems.get(system_id)?.get(&crc32.to_lowercase())
    }
}

impl Default for NoIntroDatabase {
    fn default() -> Self {
        Self::new()
    }
}

/// Parses a No-Intro DAT XML file into a lookup table.
///
/// Uses quick-xml's event-based reader to parse `<datafile>` format XML.
/// Each `<game>` element's first `<rom>` child provides the CRC32 hash
/// used as the lookup key.
pub fn parse_dat_file(path: &Path) -> Result<NoIntroDat> {
    let xml_content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read DAT file: {:?}", path))?;

    parse_dat_xml(&xml_content)
}

/// Parses No-Intro DAT XML content from a string.
///
/// Separated from `parse_dat_file` for testability.
pub fn parse_dat_xml(xml_content: &str) -> Result<NoIntroDat> {
    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text_start = true;
    reader.config_mut().trim_text_end = true;

    let mut entries: HashMap<String, NoIntroEntry> = HashMap::new();
    let mut dat_name = String::new();

    // Parser state tracking.
    let mut in_header = false;
    let mut in_header_name = false;
    let mut current_game_name: Option<String> = None;
    let mut got_rom_for_current_game = false;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                match e.name().as_ref() {
                    b"header" => {
                        in_header = true;
                    }
                    b"name" if in_header => {
                        in_header_name = true;
                    }
                    b"game" => {
                        // Extract the "name" attribute from <game name="...">.
                        current_game_name = None;
                        got_rom_for_current_game = false;
                        for attr in e.attributes().flatten() {
                            if attr.key.as_ref() == b"name" {
                                current_game_name = Some(
                                    String::from_utf8_lossy(&attr.value).to_string(),
                                );
                            }
                        }
                    }
                    b"rom" if current_game_name.is_some() && !got_rom_for_current_game => {
                        // Process <rom> as a start element (non-empty).
                        if let Some(entry) = extract_rom_entry(e.attributes(), &current_game_name) {
                            entries.insert(entry.crc32.clone(), entry);
                            got_rom_for_current_game = true;
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                if e.name().as_ref() == b"rom"
                    && current_game_name.is_some()
                    && !got_rom_for_current_game
                {
                    if let Some(entry) = extract_rom_entry(e.attributes(), &current_game_name) {
                        entries.insert(entry.crc32.clone(), entry);
                        got_rom_for_current_game = true;
                    }
                }
            }
            Ok(Event::Text(ref e)) if in_header_name => {
                dat_name = e.unescape().unwrap_or_default().to_string();
            }
            Ok(Event::End(ref e)) => {
                match e.name().as_ref() {
                    b"header" => {
                        in_header = false;
                        in_header_name = false;
                    }
                    b"name" if in_header => {
                        in_header_name = false;
                    }
                    b"game" => {
                        current_game_name = None;
                        got_rom_for_current_game = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(anyhow::anyhow!(
                    "Error parsing DAT XML at position {}: {}",
                    reader.error_position(),
                    e
                ));
            }
            _ => {}
        }
        buf.clear();
    }

    let entry_count = entries.len();
    Ok(NoIntroDat {
        info: DatFileInfo {
            name: dat_name,
            entry_count,
        },
        entries,
    })
}

/// Extracts a `NoIntroEntry` from the attributes of a `<rom>` element.
///
/// Returns `None` if the `crc` attribute is missing.
fn extract_rom_entry(
    attrs: quick_xml::events::attributes::Attributes,
    game_name: &Option<String>,
) -> Option<NoIntroEntry> {
    let mut crc: Option<String> = None;
    let mut sha1: Option<String> = None;
    let mut size: Option<u64> = None;

    for attr in attrs.flatten() {
        match attr.key.as_ref() {
            b"crc" => {
                crc = Some(String::from_utf8_lossy(&attr.value).to_lowercase());
            }
            b"sha1" => {
                sha1 = Some(String::from_utf8_lossy(&attr.value).to_lowercase());
            }
            b"size" => {
                size = String::from_utf8_lossy(&attr.value).parse().ok();
            }
            _ => {}
        }
    }

    let crc = crc?; // CRC is required
    let name = game_name.clone().unwrap_or_default();
    let region = parse_region(&name);

    Some(NoIntroEntry {
        name,
        crc32: crc,
        sha1,
        size,
        region,
    })
}

/// Extracts the region from a No-Intro game name.
///
/// Scans parenthesized groups in the name and returns the first group
/// that contains a known region keyword (e.g. "USA", "Europe", "Japan").
/// Groups like "(Rev 1)" or "(Beta)" are ignored.
pub fn parse_region(name: &str) -> Option<String> {
    // Find all parenthesized groups.
    let mut result: Option<String> = None;
    let mut start = 0;

    while let Some(open) = name[start..].find('(') {
        let abs_open = start + open;
        if let Some(close) = name[abs_open..].find(')') {
            let abs_close = abs_open + close;
            let group = &name[abs_open + 1..abs_close];

            // Check if this group contains any known region keyword.
            for region in REGIONS {
                if group.contains(region) {
                    result = Some(group.to_string());
                    // Don't break the outer loop — keep scanning for later
                    // region groups, but we take the first match we find.
                    return result;
                }
            }

            start = abs_close + 1;
        } else {
            break;
        }
    }

    result
}

/// Loads all tracked DAT files from the database and parses them into
/// an aggregated `NoIntroDatabase`.
///
/// DAT files are expected at `<dat_dir>/<system_id>.dat`. Files that
/// fail to parse are skipped with a warning.
pub fn load_all_dats(dat_dir: &Path, db: &Database) -> Result<NoIntroDatabase> {
    let mut nointro_db = NoIntroDatabase::new();

    let dat_files = db.get_dat_files()?;
    for dat_file in &dat_files {
        let dat_path = dat_dir.join(format!("{}.dat", dat_file.system_id));
        if !dat_path.exists() {
            eprintln!(
                "Warning: DAT file not found for system {}: {:?}",
                dat_file.system_id, dat_path
            );
            continue;
        }

        match parse_dat_file(&dat_path) {
            Ok(parsed) => {
                eprintln!(
                    "Loaded No-Intro DAT for {}: {} entries",
                    dat_file.system_id, parsed.info.entry_count
                );
                nointro_db
                    .systems
                    .insert(dat_file.system_id.clone(), parsed.entries);
            }
            Err(e) => {
                eprintln!(
                    "Warning: failed to parse DAT file for {}: {}",
                    dat_file.system_id, e
                );
            }
        }
    }

    Ok(nointro_db)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL_DAT: &str = r#"<?xml version="1.0"?>
<datafile>
  <header>
    <name>Nintendo - NES</name>
  </header>
  <game name="Super Mario Bros. (USA)">
    <rom name="Super Mario Bros. (USA).nes" size="40976" crc="ABCD1234" sha1="aabbccdd"/>
  </game>
  <game name="Zelda (Japan)">
    <rom name="Zelda (Japan).nes" size="131088" crc="EF567890" sha1="11223344"/>
  </game>
</datafile>"#;

    #[test]
    fn test_parse_minimal_dat() {
        let result = parse_dat_xml(MINIMAL_DAT).unwrap();
        assert_eq!(result.info.name, "Nintendo - NES");
        assert_eq!(result.info.entry_count, 2);
        assert_eq!(result.entries.len(), 2);

        let mario = result.entries.get("abcd1234").unwrap();
        assert_eq!(mario.name, "Super Mario Bros. (USA)");
        assert_eq!(mario.crc32, "abcd1234");
        assert_eq!(mario.sha1.as_deref(), Some("aabbccdd"));
        assert_eq!(mario.size, Some(40976));
        assert_eq!(mario.region.as_deref(), Some("USA"));

        let zelda = result.entries.get("ef567890").unwrap();
        assert_eq!(zelda.name, "Zelda (Japan)");
        assert_eq!(zelda.region.as_deref(), Some("Japan"));
    }

    #[test]
    fn test_parse_dat_missing_crc() {
        let xml = r#"<?xml version="1.0"?>
<datafile>
  <header><name>Test</name></header>
  <game name="No CRC Game">
    <rom name="nocrc.nes" size="1024"/>
  </game>
  <game name="Has CRC Game (USA)">
    <rom name="hascrc.nes" size="2048" crc="11111111"/>
  </game>
</datafile>"#;

        let result = parse_dat_xml(xml).unwrap();
        assert_eq!(result.entries.len(), 1);
        assert!(result.entries.contains_key("11111111"));
    }

    #[test]
    fn test_parse_dat_empty() {
        let xml = r#"<?xml version="1.0"?>
<datafile>
  <header><name>Empty DAT</name></header>
</datafile>"#;

        let result = parse_dat_xml(xml).unwrap();
        assert_eq!(result.info.name, "Empty DAT");
        assert_eq!(result.info.entry_count, 0);
        assert!(result.entries.is_empty());
    }

    #[test]
    fn test_parse_dat_malformed_xml() {
        let xml = r#"<datafile><not closed"#;
        let result = parse_dat_xml(xml);
        assert!(result.is_err());
    }

    #[test]
    fn test_lookup_exact_match() {
        let mut db = NoIntroDatabase::new();
        let mut nes_entries = HashMap::new();
        nes_entries.insert(
            "abcd1234".to_string(),
            NoIntroEntry {
                name: "Super Mario Bros. (USA)".to_string(),
                crc32: "abcd1234".to_string(),
                sha1: None,
                size: None,
                region: Some("USA".to_string()),
            },
        );
        db.systems.insert("nes".to_string(), nes_entries);

        let result = db.lookup("nes", "abcd1234");
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Super Mario Bros. (USA)");
    }

    #[test]
    fn test_lookup_case_insensitive() {
        let mut db = NoIntroDatabase::new();
        let mut nes_entries = HashMap::new();
        nes_entries.insert(
            "abcd1234".to_string(),
            NoIntroEntry {
                name: "Test Game".to_string(),
                crc32: "abcd1234".to_string(),
                sha1: None,
                size: None,
                region: None,
            },
        );
        db.systems.insert("nes".to_string(), nes_entries);

        // Lookup with uppercase should still match because lookup() lowercases.
        let result = db.lookup("nes", "ABCD1234");
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Test Game");
    }

    #[test]
    fn test_lookup_miss() {
        let mut db = NoIntroDatabase::new();
        db.systems.insert("nes".to_string(), HashMap::new());

        let result = db.lookup("nes", "ffffffff");
        assert!(result.is_none());
    }

    #[test]
    fn test_lookup_wrong_system() {
        let mut db = NoIntroDatabase::new();
        let mut nes_entries = HashMap::new();
        nes_entries.insert(
            "abcd1234".to_string(),
            NoIntroEntry {
                name: "NES Game".to_string(),
                crc32: "abcd1234".to_string(),
                sha1: None,
                size: None,
                region: None,
            },
        );
        db.systems.insert("nes".to_string(), nes_entries);

        // Same CRC but different system should not match.
        let result = db.lookup("snes", "abcd1234");
        assert!(result.is_none());
    }

    // ── Region parsing tests ──────────────────────────────────────────

    #[test]
    fn test_parse_region_usa() {
        assert_eq!(parse_region("Game Title (USA)"), Some("USA".to_string()));
    }

    #[test]
    fn test_parse_region_multi() {
        assert_eq!(
            parse_region("Game Title (USA, Europe)"),
            Some("USA, Europe".to_string())
        );
    }

    #[test]
    fn test_parse_region_japan() {
        assert_eq!(
            parse_region("Game Title (Japan)"),
            Some("Japan".to_string())
        );
    }

    #[test]
    fn test_parse_region_with_version() {
        // "(USA)" should be found first, "(Rev 1)" is not a region.
        assert_eq!(
            parse_region("Game Title (USA) (Rev 1)"),
            Some("USA".to_string())
        );
    }

    #[test]
    fn test_parse_region_none() {
        assert_eq!(parse_region("Game Title"), None);
    }

    #[test]
    fn test_parse_region_non_region_parens() {
        // "(Beta)" does not contain any known region keyword.
        assert_eq!(parse_region("Game Title (Beta)"), None);
    }
}
