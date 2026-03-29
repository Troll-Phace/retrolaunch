//! Integration tests for the RetroLaunch Emulator Launch System (Phase 3).
//!
//! These tests exercise the launcher subsystem: template expansion with
//! shell_words parsing, multi-system emulator config persistence, macOS
//! `.app` bundle resolution, and full play session lifecycle through the
//! database layer. All database tests use in-memory SQLite instances.

use retrolaunch_lib::db::Database;
use retrolaunch_lib::launcher::spawn::{expand_launch_args, resolve_executable};
use retrolaunch_lib::models::{EmulatorConfig, ScannedRom};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Helper: create a ScannedRom for testing.
// ---------------------------------------------------------------------------
fn make_test_rom(name: &str, system: &str) -> ScannedRom {
    ScannedRom {
        file_path: PathBuf::from(format!("/roms/{}.rom", name)),
        file_name: format!("{}.rom", name),
        file_size: 2048,
        last_modified: "1700000000".to_string(),
        system_id: system.to_string(),
        crc32: "deadbeef".to_string(),
        sha1: Some("abcdef0123456789abcdef0123456789abcdef01".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Helper: create an EmulatorConfig for testing.
// ---------------------------------------------------------------------------
fn make_config(system_id: &str, exe: &str, args: &str) -> EmulatorConfig {
    EmulatorConfig {
        id: None,
        system_id: system_id.to_string(),
        system_name: format!("{} emulator", system_id),
        executable_path: exe.to_string(),
        launch_args: args.to_string(),
        supported_extensions: format!("[\"{}\"]", system_id),
        auto_detected: false,
        created_at: None,
        updated_at: None,
    }
}

// ---------------------------------------------------------------------------
// 1. ROM template expansion + shell_words parsing
// ---------------------------------------------------------------------------
#[test]
fn test_expand_launch_args_with_spaces_then_parse() {
    // A ROM path with spaces -- a very common real-world scenario.
    let rom_path = "/Users/player/My ROMs/NES Games/Super Mario Bros.nes";
    let template = "--fullscreen \"{rom}\"";

    let expanded = expand_launch_args(template, rom_path);
    assert_eq!(
        expanded,
        "--fullscreen \"/Users/player/My ROMs/NES Games/Super Mario Bros.nes\""
    );

    // Parse with shell_words to verify the quoting is correct.
    let args = shell_words::split(&expanded).unwrap();
    assert_eq!(args.len(), 2, "Should produce exactly 2 arguments");
    assert_eq!(args[0], "--fullscreen");
    assert_eq!(
        args[1], "/Users/player/My ROMs/NES Games/Super Mario Bros.nes",
        "Quoted path should be a single argument with spaces preserved"
    );
}

#[test]
fn test_expand_launch_args_complex_flags_then_parse() {
    let rom_path = "/roms/game.nes";
    let template = "-L /cores/nestopia.so --config /config/retroarch.cfg \"{rom}\"";

    let expanded = expand_launch_args(template, rom_path);
    let args = shell_words::split(&expanded).unwrap();

    assert_eq!(args.len(), 5, "Should produce 5 arguments");
    assert_eq!(args[0], "-L");
    assert_eq!(args[1], "/cores/nestopia.so");
    assert_eq!(args[2], "--config");
    assert_eq!(args[3], "/config/retroarch.cfg");
    assert_eq!(args[4], "/roms/game.nes");
}

#[test]
fn test_expand_launch_args_empty_args() {
    // Edge case: empty launch_args template.
    let expanded = expand_launch_args("", "/roms/game.nes");
    assert_eq!(expanded, "");

    let args = shell_words::split(&expanded).unwrap();
    assert!(args.is_empty(), "Empty template should produce zero args");
}

// ---------------------------------------------------------------------------
// 2. Multi-system emulator config persistence
// ---------------------------------------------------------------------------
#[test]
fn test_multi_system_emulator_config_persistence() {
    let db = Database::new_in_memory().unwrap();

    // Configure emulators for three distinct systems.
    let configs = vec![
        make_config("nes", "/usr/bin/fceux", "\"{rom}\""),
        make_config("snes", "/usr/bin/snes9x", "--fullscreen \"{rom}\""),
        make_config("genesis", "/usr/bin/blastem", "\"{rom}\""),
    ];

    for config in &configs {
        db.set_emulator_config(config).unwrap();
    }

    // Verify each is individually retrievable with correct fields.
    let nes = db.get_emulator_config("nes").unwrap().unwrap();
    assert_eq!(nes.executable_path, "/usr/bin/fceux");
    assert_eq!(nes.launch_args, "\"{rom}\"");

    let snes = db.get_emulator_config("snes").unwrap().unwrap();
    assert_eq!(snes.executable_path, "/usr/bin/snes9x");
    assert_eq!(snes.launch_args, "--fullscreen \"{rom}\"");

    let genesis = db.get_emulator_config("genesis").unwrap().unwrap();
    assert_eq!(genesis.executable_path, "/usr/bin/blastem");

    // Verify total count.
    let all = db.get_emulator_configs().unwrap();
    assert_eq!(all.len(), 3, "Exactly 3 emulator configs should exist");
}

#[test]
fn test_emulator_config_upsert_preserves_single_row() {
    let db = Database::new_in_memory().unwrap();

    // Insert and then update the same system_id three times.
    let paths = ["/v1/emu", "/v2/emu", "/v3/emu"];
    for path in &paths {
        let config = make_config("nes", path, "\"{rom}\"");
        db.set_emulator_config(&config).unwrap();
    }

    // Should still be exactly 1 config for NES.
    let all = db.get_emulator_configs().unwrap();
    assert_eq!(all.len(), 1, "UPSERT should keep a single row per system");

    let nes = db.get_emulator_config("nes").unwrap().unwrap();
    assert_eq!(
        nes.executable_path, "/v3/emu",
        "Should have the last-written executable_path"
    );
}

// ---------------------------------------------------------------------------
// 3. macOS .app bundle resolution
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
#[test]
fn test_resolve_executable_macos_app_bundle_stem() {
    use std::fs;

    let tmp = tempfile::TempDir::new().unwrap();

    // Build a synthetic .app bundle: MyEmulator.app/Contents/MacOS/MyEmulator
    let app_dir = tmp.path().join("MyEmulator.app");
    let macos_dir = app_dir.join("Contents").join("MacOS");
    fs::create_dir_all(&macos_dir).unwrap();

    let binary = macos_dir.join("MyEmulator");
    fs::write(&binary, b"#!/bin/sh\necho hello").unwrap();

    // Make it executable (not strictly needed for resolve_executable, but realistic).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();
    }

    let resolved = resolve_executable(&app_dir.to_string_lossy()).unwrap();
    assert_eq!(
        resolved,
        binary.to_string_lossy().to_string(),
        "Should resolve to Contents/MacOS/<stem>"
    );
}

#[cfg(target_os = "macos")]
#[test]
fn test_resolve_executable_macos_app_bundle_fallback() {
    use std::fs;

    let tmp = tempfile::TempDir::new().unwrap();

    // Build a .app bundle where the binary name does NOT match the stem.
    // DifferentName.app/Contents/MacOS/actual_binary
    let app_dir = tmp.path().join("DifferentName.app");
    let macos_dir = app_dir.join("Contents").join("MacOS");
    fs::create_dir_all(&macos_dir).unwrap();

    let binary = macos_dir.join("actual_binary");
    fs::write(&binary, b"#!/bin/sh\necho hello").unwrap();

    let resolved = resolve_executable(&app_dir.to_string_lossy()).unwrap();
    assert_eq!(
        resolved,
        binary.to_string_lossy().to_string(),
        "Should fall back to the first non-hidden file in Contents/MacOS/"
    );
}

#[cfg(target_os = "macos")]
#[test]
fn test_resolve_executable_macos_app_bundle_empty() {
    use std::fs;

    let tmp = tempfile::TempDir::new().unwrap();

    // Build a .app bundle with an empty Contents/MacOS/ directory.
    let app_dir = tmp.path().join("Empty.app");
    let macos_dir = app_dir.join("Contents").join("MacOS");
    fs::create_dir_all(&macos_dir).unwrap();

    let result = resolve_executable(&app_dir.to_string_lossy());
    assert!(
        result.is_err(),
        "Should return an error for a .app bundle with no binary"
    );
}

// ---------------------------------------------------------------------------
// 4. Full session lifecycle via database
// ---------------------------------------------------------------------------
#[test]
fn test_full_session_lifecycle() {
    let db = Database::new_in_memory().unwrap();

    // Setup: insert a game.
    let rom = make_test_rom("lifecycle_test", "nes");
    let game_id = db.insert_game(&rom).unwrap();
    assert!(game_id > 0);

    // Precondition: no sessions, not playing.
    let stats_before = db.get_play_stats(game_id).unwrap();
    assert_eq!(stats_before.session_count, 0);
    assert!(stats_before.sessions.is_empty());

    let game = db.get_game_by_id(game_id).unwrap().unwrap();
    assert!(!game.currently_playing);
    assert!(game.last_played_at.is_none());

    // Start session.
    let session_id = db.start_play_session(game_id).unwrap();
    assert!(session_id > 0);

    // During session: game is marked as playing.
    let game_during = db.get_game_by_id(game_id).unwrap().unwrap();
    assert!(game_during.currently_playing);

    // End session.
    let duration = db.end_play_session(session_id).unwrap();
    assert!(duration >= 0);

    // After session: game is no longer playing and stats are updated.
    let game_after = db.get_game_by_id(game_id).unwrap().unwrap();
    assert!(!game_after.currently_playing);
    assert!(game_after.last_played_at.is_some());

    let stats_after = db.get_play_stats(game_id).unwrap();
    assert_eq!(stats_after.session_count, 1);
    assert_eq!(stats_after.sessions.len(), 1);
    assert!(stats_after.last_played_at.is_some());

    // Verify session record details.
    let session = &stats_after.sessions[0];
    assert_eq!(session.game_id, game_id);
    assert_eq!(session.id, session_id);
    assert!(session.ended_at.is_some());
    assert!(session.duration_seconds.is_some());
}

#[test]
fn test_session_lifecycle_multiple_games() {
    let db = Database::new_in_memory().unwrap();

    // Insert two different games.
    let game1_id = db
        .insert_game(&make_test_rom("game_a", "nes"))
        .unwrap();
    let game2_id = db
        .insert_game(&make_test_rom("game_b", "snes"))
        .unwrap();

    // Play game1 twice, game2 once.
    for _ in 0..2 {
        let sid = db.start_play_session(game1_id).unwrap();
        db.end_play_session(sid).unwrap();
    }
    let sid2 = db.start_play_session(game2_id).unwrap();
    db.end_play_session(sid2).unwrap();

    let stats1 = db.get_play_stats(game1_id).unwrap();
    assert_eq!(stats1.session_count, 2);

    let stats2 = db.get_play_stats(game2_id).unwrap();
    assert_eq!(stats2.session_count, 1);
}

#[test]
fn test_orphan_cleanup_in_lifecycle() {
    let db = Database::new_in_memory().unwrap();

    let rom = make_test_rom("orphan_lifecycle", "gba");
    let game_id = db.insert_game(&rom).unwrap();

    // Start a session and "crash" (do not end it).
    let _orphaned_sid = db.start_play_session(game_id).unwrap();

    // Verify currently_playing is true.
    let game = db.get_game_by_id(game_id).unwrap().unwrap();
    assert!(game.currently_playing);

    // Simulate app restart: cleanup orphans.
    let cleaned = db.cleanup_orphaned_sessions().unwrap();
    assert_eq!(cleaned, 1);

    // Game should no longer be marked as playing.
    let game_cleaned = db.get_game_by_id(game_id).unwrap().unwrap();
    assert!(!game_cleaned.currently_playing);

    // A second cleanup should find nothing.
    let cleaned2 = db.cleanup_orphaned_sessions().unwrap();
    assert_eq!(cleaned2, 0);
}

// ---------------------------------------------------------------------------
// 5. resolve_executable for a regular file (cross-platform)
// ---------------------------------------------------------------------------
#[test]
fn test_resolve_executable_regular_file() {
    use std::fs;

    let tmp = tempfile::TempDir::new().unwrap();
    let exe = tmp.path().join("my_emulator");
    fs::write(&exe, b"binary content").unwrap();

    let resolved = resolve_executable(&exe.to_string_lossy()).unwrap();
    assert_eq!(resolved, exe.to_string_lossy().to_string());
}

#[test]
fn test_resolve_executable_nonexistent_file() {
    let result = resolve_executable("/does/not/exist/emulator_binary");
    assert!(
        result.is_err(),
        "Should return an error for a nonexistent path"
    );
}
