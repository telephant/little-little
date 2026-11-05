//! App state: the journal is locked (None) until setup/unlock succeeds.
//! Unlocking also starts the background embed worker (F-3).

use crate::storage::{Storage, StorageError};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

#[derive(Default)]
pub struct AppState {
    db: Mutex<Option<Arc<Storage>>>,
    worker: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    /// Pinged after saves / model changes; the embed worker waits on it.
    pub embed_notify: Arc<Notify>,
    /// The one in-flight model pull, if any (C-14; single pull at a time).
    pub pulling: Mutex<Option<crate::activity::PullInfo>>,
}

impl AppState {
    /// Install the unlocked database and (re)start the embed worker.
    pub fn set_db(&self, storage: Storage) {
        let storage = Arc::new(storage);
        *self.db.lock().unwrap() = Some(storage.clone());
        let mut worker = self.worker.lock().unwrap();
        if let Some(old) = worker.take() {
            old.abort();
        }
        *worker = Some(crate::memory::spawn_worker(
            storage,
            self.embed_notify.clone(),
        ));
    }

    /// Wake the embed worker (after save_entry / set_models).
    pub fn poke_worker(&self) {
        self.embed_notify.notify_one();
    }

    /// Shared handle for long-lived tasks.
    pub fn db_handle(&self) -> Option<Arc<Storage>> {
        self.db.lock().unwrap().clone()
    }

    pub fn with_db<T>(
        &self,
        f: impl FnOnce(&Storage) -> Result<T, StorageError>,
    ) -> Result<T, String> {
        match self.db_handle() {
            Some(db) => f(&db).map_err(|e| e.to_string()),
            None => Err("journal is locked".into()),
        }
    }
}
