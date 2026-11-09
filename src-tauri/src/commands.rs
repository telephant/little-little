//! IPC layer (C-4): thin Tauri command wrappers over Storage.
//! The passphrase enters here, goes straight into SQLCipher keying, and is
//! never stored, logged, or sent back over IPC.

use crate::state::AppState;
use crate::storage::{Entry, EntrySummary, Storage};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

type CmdResult<T> = Result<T, String>;

fn db_path(app: &AppHandle) -> CmdResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("journal.db"))
}

/// First-run check: does a journal file exist yet?
#[tauri::command]
pub fn journal_exists(app: AppHandle) -> CmdResult<bool> {
    Ok(db_path(&app)?.exists())
}

/// First run: create the journal keyed with the chosen passphrase.
#[tauri::command]
pub fn setup_passphrase(app: AppHandle, state: State<AppState>, passphrase: String) -> CmdResult<()> {
    let path = db_path(&app)?;
    if path.exists() {
        return Err("journal already exists".into());
    }
    let storage = Storage::open(&path, &passphrase).map_err(|e| e.to_string())?;
    state.set_db(storage);
    Ok(())
}

/// Unlock an existing journal. Wrong passphrase => Err, retry allowed (AC-3).
#[tauri::command]
pub fn unlock(app: AppHandle, state: State<AppState>, passphrase: String) -> CmdResult<()> {
    let path = db_path(&app)?;
    if !path.exists() {
        return Err("no journal yet".into());
    }
    let storage = Storage::open(&path, &passphrase).map_err(|e| e.to_string())?;
    state.set_db(storage);
    Ok(())
}

#[tauri::command]
pub fn create_entry(state: State<AppState>) -> CmdResult<Entry> {
    state.with_db(|db| db.create_entry())
}

#[tauri::command]
pub fn save_entry(state: State<AppState>, id: String, body: String) -> CmdResult<()> {
    state.with_db(|db| db.save_entry(&id, &body))?;
    state.poke_worker(); // embedding happens in the background (AC-4)
    Ok(())
}

#[tauri::command]
pub fn list_entries(state: State<AppState>) -> CmdResult<Vec<EntrySummary>> {
    state.with_db(|db| db.list_entries())
}

#[tauri::command]
pub fn get_entry(state: State<AppState>, id: String) -> CmdResult<Entry> {
    state.with_db(|db| db.get_entry(&id))
}

#[tauri::command]
pub fn delete_entry(state: State<AppState>, id: String) -> CmdResult<()> {
    state.with_db(|db| db.delete_entry(&id))
}

#[tauri::command]
pub fn set_tags(state: State<AppState>, id: String, tags: Vec<String>) -> CmdResult<()> {
    state.with_db(|db| db.set_tags(&id, &tags))
}

#[tauri::command]
pub fn set_no_cloud(state: State<AppState>, id: String, no_cloud: bool) -> CmdResult<()> {
    state.with_db(|db| db.set_no_cloud(&id, no_cloud))
}

/// Calendar month (M2, AC-20): local days with entries and their display mood.
#[tauri::command]
pub fn calendar_month(state: State<AppState>, year: i32, month: u32) -> CmdResult<Vec<crate::storage::DayMood>> {
    state.with_db(|db| db.calendar_month(year, month))
}

/// Manual mood (M2, AC-19): permanent, AI never overwrites it.
#[tauri::command]
pub fn set_mood(state: State<AppState>, id: String, level: i64, label: Option<String>) -> CmdResult<()> {
    if !(1..=5).contains(&level) {
        return Err("mood level must be 1..=5".into());
    }
    state.with_db(|db| db.set_mood(&id, level, label.as_deref()))
}

/// Painted mark (paint-marks, ADR-0006): validated by storage; a mark is not text, so nothing is re-queued.
#[tauri::command]
pub fn set_mark(state: State<AppState>, id: String, mark: String) -> CmdResult<()> {
    state.with_db(|db| db.set_mark(&id, &mark))
}

/// Back to the default mood mark.
#[tauri::command]
pub fn clear_mark(state: State<AppState>, id: String) -> CmdResult<()> {
    state.with_db(|db| db.clear_mark(&id))
}

// --- settings & models (T-05, D-5/D-6) ---

use crate::providers::{claude_on_path, ollama};
use crate::storage::SettingsView;
use serde::Serialize;

#[derive(Serialize)]
pub struct AvailableModels {
    pub ollama_running: bool,
    pub ollama_models: Vec<String>,
    pub claude_available: bool,
}

#[tauri::command]
pub async fn list_available_models() -> CmdResult<AvailableModels> {
    let (running, models) = match ollama::list_models(ollama::BASE_URL).await {
        Ok(m) => (true, m),
        Err(_) => (false, vec![]),
    };
    Ok(AvailableModels {
        ollama_running: running,
        ollama_models: models,
        claude_available: claude_on_path(),
    })
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> CmdResult<SettingsView> {
    state.with_db(|db| db.settings_view())
}

/// Switching to a cloud provider without prior confirmation fails with the
/// sentinel "cloud-not-confirmed"; the frontend shows the dialog and retries
/// with confirm=true (D-5, AC-17).
#[tauri::command]
pub fn set_provider(state: State<AppState>, provider: String, confirm: bool) -> CmdResult<SettingsView> {
    state.with_db(|db| db.set_provider(&provider, confirm))
}

#[tauri::command]
pub async fn set_models(
    state: State<'_, AppState>,
    embed_model: Option<String>,
    chat_model: Option<String>,
) -> CmdResult<SettingsView> {
    if let Some(model) = embed_model {
        // Probe the dimension first (network), then apply (storage, transactional).
        let dim = ollama::probe_dim(ollama::BASE_URL, &model)
            .await
            .map_err(|e| e.to_string())?;
        state.with_db(|db| db.apply_embed_model(&model, dim))?;
    }
    if let Some(model) = chat_model {
        state.with_db(|db| db.set_chat_model(&model))?;
    }
    state.poke_worker(); // a newly chosen embed model unblocks pending entries (AC-16)
    state.with_db(|db| db.settings_view())
}

// --- AI panel (T-08, F-4) ---

use crate::prompt::{self, PanelState};
use crate::providers::AnyChatProvider;

#[tauri::command]
pub async fn get_ai_panel(state: State<'_, AppState>, entry_id: String) -> CmdResult<PanelState> {
    let db = state.db_handle().ok_or("journal is locked")?;
    let settings = db.settings_view().map_err(|e| e.to_string())?;
    let Some(provider) = AnyChatProvider::active_from(&settings) else {
        return Ok(PanelState::ModelsNotChosen);
    };
    prompt::build_ai_panel(&db, &provider, &entry_id, false).await
}

#[tauri::command]
pub async fn regenerate_reflection(
    state: State<'_, AppState>,
    entry_id: String,
) -> CmdResult<PanelState> {
    let db = state.db_handle().ok_or("journal is locked")?;
    if let Some(existing) = db.latest_reflection(&entry_id).map_err(|e| e.to_string())? {
        db.dismiss_response(&existing.id).map_err(|e| e.to_string())?;
    }
    let settings = db.settings_view().map_err(|e| e.to_string())?;
    let Some(provider) = AnyChatProvider::active_from(&settings) else {
        return Ok(PanelState::ModelsNotChosen);
    };
    prompt::build_ai_panel(&db, &provider, &entry_id, true).await
}

#[tauri::command]
pub fn dismiss_response(state: State<AppState>, id: String) -> CmdResult<()> {
    state.with_db(|db| db.dismiss_response(&id))
}

// --- pull manager + activity (T-17, AC-27/AC-29) ---

use crate::activity::{Activity, PullInfo};
use crate::providers::pull::{self, PullProgress};
use tauri::ipc::Channel;

/// Download a model with live progress (AC-27). One pull at a time.
#[tauri::command]
pub async fn pull_model(
    state: State<'_, AppState>,
    model: String,
    on_progress: Channel<PullProgress>,
) -> CmdResult<()> {
    {
        let mut pulling = state.pulling.lock().unwrap();
        if pulling.is_some() {
            return Err("another download is already running".into());
        }
        *pulling = Some(PullInfo {
            model: model.clone(),
            pct: 0.0,
            status: "starting".into(),
        });
    }
    let result = pull::pull_model(crate::providers::ollama::BASE_URL, &model, |event| {
        if let Ok(mut pulling) = state.pulling.lock()
            && let Some(info) = pulling.as_mut()
        {
            if let Some(pct) = event.pct {
                info.pct = pct;
            }
            info.status = event.status.clone();
        }
        let _ = on_progress.send(event);
    })
    .await;
    *state.pulling.lock().unwrap() = None;
    result
}

/// Honest busy/idle state for chips + the global indicator (AC-29).
#[tauri::command]
pub fn get_activity(state: State<AppState>) -> CmdResult<Activity> {
    let db = state.db_handle().ok_or("journal is locked")?;
    let (embed_pending, embed_total, mood_pending) = crate::activity::counts(&db)?;
    Ok(Activity {
        embed_pending,
        embed_total,
        mood_pending,
        pulling: state.pulling.lock().unwrap().clone(),
    })
}

// --- export / restore (T-16, F-10) ---

#[tauri::command]
pub fn export_markdown(state: State<AppState>, dir: String) -> CmdResult<usize> {
    let db = state.db_handle().ok_or("journal is locked")?;
    crate::export::export_markdown(&db, std::path::Path::new(&dir))
}

#[tauri::command]
pub fn export_json(state: State<AppState>, path: String) -> CmdResult<usize> {
    let db = state.db_handle().ok_or("journal is locked")?;
    crate::export::export_json(&db, std::path::Path::new(&path))
}

#[tauri::command]
pub fn restore_json(state: State<AppState>, path: String) -> CmdResult<usize> {
    let db = state.db_handle().ok_or("journal is locked")?;
    let n = crate::export::restore_json(&db, std::path::Path::new(&path))?;
    state.poke_worker(); // restored entries re-embed in the background
    Ok(n)
}

// --- semantic search (T-14, F-9) ---

use crate::memory::search::{self, SearchAnswer, SearchOutput};

/// Instant ranked results — never makes a chat call (NFR).
#[tauri::command]
pub async fn search(state: State<'_, AppState>, query: String) -> CmdResult<SearchOutput> {
    let db = state.db_handle().ok_or("journal is locked")?;
    let settings = db.settings_view().map_err(|e| e.to_string())?;
    let Some(embed_model) = settings.embed_model.clone() else {
        return Err("choose models in settings first".into());
    };
    let embedder = ollama::OllamaEmbed {
        base_url: ollama::BASE_URL.to_string(),
        model: embed_model,
    };
    let cloud = AnyChatProvider::active_from(&settings)
        .map(|p| p.is_cloud())
        .unwrap_or(false);
    search::search_entries(&db, &embedder, &query, cloud).await
}

/// The independent AI answer for already-ranked results (AC-22).
#[tauri::command]
pub async fn search_answer(
    state: State<'_, AppState>,
    query: String,
    entry_ids: Vec<String>,
) -> CmdResult<SearchAnswer> {
    let db = state.db_handle().ok_or("journal is locked")?;
    let settings = db.settings_view().map_err(|e| e.to_string())?;
    let provider = AnyChatProvider::active_from(&settings)
        .ok_or("choose a chat model in settings first")?;
    search::search_answer(&db, &provider, &query, &entry_ids)
        .await
        .map_err(|e| e.to_string())
}
