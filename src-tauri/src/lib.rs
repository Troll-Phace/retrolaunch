pub mod commands;
pub mod db;
pub mod launcher;
pub mod metadata;
pub mod models;
pub mod scanner;

use std::sync::Arc;
use tauri::Manager;

/// Loads a credential value by checking the database preferences table first,
/// then falling back to an environment variable, and finally returning an
/// empty string if neither source has a value.
fn load_credential(db: &db::Database, pref_key: &str, env_key: &str) -> String {
    db.get_preference(pref_key)
        .ok()
        .flatten()
        .or_else(|| std::env::var(env_key).ok())
        .unwrap_or_default()
}

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

            // Initialize metadata API clients with credentials from preferences
            // or environment variables.
            let igdb_client_id =
                load_credential(&db, "igdb_client_id", "IGDB_CLIENT_ID");
            let igdb_client_secret =
                load_credential(&db, "igdb_client_secret", "IGDB_CLIENT_SECRET");
            let ss_dev_id =
                load_credential(&db, "ss_dev_id", "SS_DEV_ID");
            let ss_dev_password =
                load_credential(&db, "ss_dev_password", "SS_DEV_PASSWORD");
            let ss_username =
                load_credential(&db, "ss_username", "SS_USERNAME");
            let ss_password =
                load_credential(&db, "ss_password", "SS_PASSWORD");

            let igdb = metadata::igdb::IgdbClient::new(
                igdb_client_id,
                igdb_client_secret,
            );
            let screenscraper = metadata::screenscraper::ScreenScraperClient::new(
                ss_dev_id,
                ss_dev_password,
                ss_username,
                ss_password,
            );
            let image_cache =
                metadata::cache::ImageCache::new(&app_data_dir, false)
                    .expect("Failed to initialize image cache");

            let metadata_clients = metadata::MetadataClients {
                igdb,
                screenscraper,
                image_cache,
            };
            app.manage(Arc::new(metadata_clients));

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
            commands::metadata::fetch_metadata,
            commands::metadata::get_cache_stats,
            commands::metadata::clear_cache,
            commands::config::get_preferences,
            commands::config::set_preference,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
