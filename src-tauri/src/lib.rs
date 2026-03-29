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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
