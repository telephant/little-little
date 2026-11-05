mod activity;
mod commands;
mod export;
mod memory;
mod prompt;
mod providers;
mod state;
mod storage;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::journal_exists,
            commands::setup_passphrase,
            commands::unlock,
            commands::create_entry,
            commands::save_entry,
            commands::list_entries,
            commands::get_entry,
            commands::delete_entry,
            commands::set_tags,
            commands::set_no_cloud,
            commands::set_mood,
            commands::calendar_month,
            commands::list_available_models,
            commands::get_settings,
            commands::set_provider,
            commands::set_models,
            commands::search,
            commands::search_answer,
            commands::pull_model,
            commands::get_activity,
            commands::export_markdown,
            commands::export_json,
            commands::restore_json,
            commands::get_ai_panel,
            commands::regenerate_reflection,
            commands::dismiss_response,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
