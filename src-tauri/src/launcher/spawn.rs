//! Process spawning, `{rom}` template expansion, and macOS `.app` bundle resolution.

use crate::launcher::LauncherError;

/// Expands the `{rom}` placeholder in `launch_args` with the actual ROM path.
///
/// For example, `"\"{rom}\""` with rom_path `/roms/game.nes` produces
/// `"\"/roms/game.nes\""`.
pub fn expand_launch_args(launch_args: &str, rom_path: &str) -> String {
    launch_args.replace("{rom}", rom_path)
}

/// Resolves the actual executable path, handling macOS `.app` bundles.
///
/// On macOS, if the path ends with `.app`, this function looks inside the bundle
/// at `Contents/MacOS/<stem>` first, then falls back to the first non-hidden
/// file in `Contents/MacOS/`.
///
/// On all platforms, verifies the path exists on disk.
pub fn resolve_executable(path: &str) -> Result<String, LauncherError> {
    let p = std::path::Path::new(path);

    #[cfg(target_os = "macos")]
    {
        if p.extension().is_some_and(|ext| ext == "app") {
            // Try Contents/MacOS/<stem> (the conventional location).
            let stem = p
                .file_stem()
                .ok_or_else(|| LauncherError::InvalidExecutable(path.to_string()))?
                .to_string_lossy();
            let binary = p.join("Contents").join("MacOS").join(stem.as_ref());
            if binary.exists() {
                return Ok(binary.to_string_lossy().to_string());
            }

            // Fallback: scan Contents/MacOS/ for the first non-hidden file.
            let macos_dir = p.join("Contents").join("MacOS");
            if macos_dir.is_dir() {
                for entry in std::fs::read_dir(&macos_dir)
                    .map_err(|e| LauncherError::InvalidExecutable(format!("{}: {}", path, e)))?
                {
                    let entry =
                        entry.map_err(|e| LauncherError::InvalidExecutable(e.to_string()))?;
                    let metadata = entry
                        .metadata()
                        .map_err(|e| LauncherError::InvalidExecutable(e.to_string()))?;
                    if metadata.is_file()
                        && !entry.file_name().to_string_lossy().starts_with('.')
                    {
                        return Ok(entry.path().to_string_lossy().to_string());
                    }
                }
            }

            return Err(LauncherError::InvalidExecutable(format!(
                "Could not resolve binary in .app bundle: {}",
                path
            )));
        }
    }

    if !p.exists() {
        return Err(LauncherError::EmulatorNotFound(path.to_string()));
    }
    Ok(path.to_string())
}

/// Builds and spawns the emulator process.
///
/// 1. Resolves the executable path (handles `.app` bundles on macOS).
/// 2. Expands the `{rom}` placeholder in launch args.
/// 3. Parses args with `shell_words::split` for proper quoting support.
/// 4. Spawns via `tokio::process::Command` with `kill_on_drop(false)` so the
///    emulator survives if RetroLaunch is closed.
pub async fn spawn_emulator(
    executable_path: &str,
    launch_args: &str,
    rom_path: &str,
) -> Result<tokio::process::Child, LauncherError> {
    let resolved = resolve_executable(executable_path)?;
    let expanded = expand_launch_args(launch_args, rom_path);
    let args =
        shell_words::split(&expanded).map_err(|e| LauncherError::InvalidArgs(e.to_string()))?;

    let child = tokio::process::Command::new(&resolved)
        .args(&args)
        .kill_on_drop(false)
        .spawn()
        .map_err(|e| LauncherError::SpawnFailed {
            executable: resolved,
            reason: e.to_string(),
        })?;

    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_launch_args_basic() {
        let result = expand_launch_args("\"{rom}\"", "/roms/game.nes");
        assert_eq!(result, "\"/roms/game.nes\"");
    }

    #[test]
    fn test_expand_launch_args_with_flags() {
        let result = expand_launch_args("--fullscreen \"{rom}\"", "/roms/sonic.md");
        assert_eq!(result, "--fullscreen \"/roms/sonic.md\"");
    }

    #[test]
    fn test_expand_launch_args_no_placeholder() {
        let result = expand_launch_args("--help", "/roms/game.nes");
        assert_eq!(result, "--help");
    }

    #[test]
    fn test_expand_launch_args_multiple_placeholders() {
        let result = expand_launch_args("{rom} --save {rom}.sav", "/roms/game.nes");
        assert_eq!(result, "/roms/game.nes --save /roms/game.nes.sav");
    }

    #[test]
    fn test_resolve_executable_nonexistent() {
        let result = resolve_executable("/nonexistent/path/to/emulator");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.to_string().contains("not found"),
            "Expected 'not found' in error, got: {}",
            err
        );
    }
}
