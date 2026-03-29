pub mod commands;
pub mod db;
pub mod launcher;
pub mod metadata;
pub mod models;
pub mod scanner;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db = Arc::new(db::Database::new(&app_data_dir)?);

            // Clean up orphaned play sessions from previous app crashes.
            match db.cleanup_orphaned_sessions() {
                Ok(count) if count > 0 => {
                    eprintln!("Cleaned up {} orphaned play session(s)", count);
                }
                Ok(_) => {}
                Err(e) => {
                    eprintln!("Warning: failed to cleanup orphaned sessions: {}", e);
                }
            }

            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scanner::scan_directories,
            commands::scanner::add_watched_directory,
            commands::scanner::remove_watched_directory,
            commands::scanner::get_games,
            commands::scanner::get_systems,
            commands::scanner::get_watched_directories,
            commands::launcher::get_emulator_configs,
            commands::launcher::set_emulator_config,
            commands::launcher::auto_detect_emulators,
            commands::launcher::launch_game,
            commands::launcher::get_play_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
