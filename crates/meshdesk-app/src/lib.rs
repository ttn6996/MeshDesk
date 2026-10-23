use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use meshdesk_core::{AppSettings, ConnectionType, Device, Result, SessionInfo, SessionState};
use meshdesk_identity::{IdentityInfo, NodeIdentity};
use meshdesk_storage::Storage;
use rand::RngCore;
use tauri::State;

pub struct AppState {
    pub identity: Arc<NodeIdentity>,
    pub storage: Arc<Storage>,
}

impl AppState {
    /// Initialize with persistent files located in standard OS app data directory
    pub fn init_persistent() -> std::result::Result<Self, String> {
        let data_dir = get_app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data directory {:?}: {e}", data_dir))?;

        // Persistent identity key
        let key_path = data_dir.join("identity.key");
        let identity = if key_path.exists() {
            let mut file =
                File::open(&key_path).map_err(|e| format!("Failed to open identity key: {e}"))?;
            let mut seed = [0u8; 32];
            file.read_exact(&mut seed)
                .map_err(|e| format!("Corrupt identity key file: {e}"))?;
            NodeIdentity::from_seed(&seed)
        } else {
            let mut seed = [0u8; 32];
            rand::rngs::OsRng.fill_bytes(&mut seed);
            let mut file = File::create(&key_path)
                .map_err(|e| format!("Failed to create identity key: {e}"))?;
            file.write_all(&seed)
                .map_err(|e| format!("Failed to write identity key: {e}"))?;
            NodeIdentity::from_seed(&seed)
        };

        // Persistent SQLite database
        let db_path = data_dir.join("meshdesk.db");
        let storage = Storage::open(&db_path)
            .map_err(|e| format!("Failed to open database at {:?}: {e}", db_path))?;

        Ok(Self {
            identity: Arc::new(identity),
            storage: Arc::new(storage),
        })
    }

    /// Initialize with in-memory database and fresh identity for unit testing
    pub fn new_in_memory() -> Result<Self> {
        let identity = Arc::new(NodeIdentity::generate());
        let storage = Arc::new(Storage::in_memory()?);
        Ok(Self { identity, storage })
    }

    pub fn get_local_identity(&self) -> IdentityInfo {
        self.identity.info()
    }

    pub fn list_devices(&self) -> Result<Vec<Device>> {
        self.storage.list_devices()
    }

    pub fn save_device(&self, device: Device) -> Result<()> {
        self.storage.save_device(&device)
    }

    pub fn delete_device(&self, id: &str) -> Result<bool> {
        self.storage.delete_device(id)
    }

    pub fn get_settings(&self) -> Result<AppSettings> {
        self.storage.get_settings()
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        self.storage.save_settings(settings)
    }

    pub fn simulate_connect(&self, target_id: &str, target_name: &str) -> SessionInfo {
        let mut session = SessionInfo::new(target_id, target_name, ConnectionType::Lan, true);
        session.state = SessionState::Connected;
        session.latency_ms = None;
        session.fps = None;
        session
    }
}

pub fn get_app_data_dir() -> std::io::Result<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        Ok(PathBuf::from(appdata).join("MeshDesk"))
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        Ok(PathBuf::from(home).join(".meshdesk"))
    } else {
        Ok(PathBuf::from("./meshdesk_data"))
    }
}

// ==========================================
// Tauri 2 IPC Commands Module
// ==========================================
pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn get_local_identity(
        state: State<'_, AppState>,
    ) -> std::result::Result<IdentityInfo, String> {
        Ok(state.get_local_identity())
    }

    #[tauri::command]
    pub fn cmd_get_local_identity(
        state: State<'_, AppState>,
    ) -> std::result::Result<IdentityInfo, String> {
        Ok(state.get_local_identity())
    }

    #[tauri::command]
    pub fn list_devices(state: State<'_, AppState>) -> std::result::Result<Vec<Device>, String> {
        state.list_devices().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn cmd_list_devices(
        state: State<'_, AppState>,
    ) -> std::result::Result<Vec<Device>, String> {
        state.list_devices().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn save_device(
        state: State<'_, AppState>,
        device: Device,
    ) -> std::result::Result<(), String> {
        state.save_device(device).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn cmd_save_device(
        state: State<'_, AppState>,
        device: Device,
    ) -> std::result::Result<(), String> {
        state.save_device(device).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn delete_device(
        state: State<'_, AppState>,
        id: String,
    ) -> std::result::Result<bool, String> {
        state.delete_device(&id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn cmd_delete_device(
        state: State<'_, AppState>,
        id: String,
    ) -> std::result::Result<bool, String> {
        state.delete_device(&id).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn get_app_settings(
        state: State<'_, AppState>,
    ) -> std::result::Result<AppSettings, String> {
        state.get_settings().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn cmd_get_app_settings(
        state: State<'_, AppState>,
    ) -> std::result::Result<AppSettings, String> {
        state.get_settings().map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn save_app_settings(
        state: State<'_, AppState>,
        settings: AppSettings,
    ) -> std::result::Result<(), String> {
        state.save_settings(&settings).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn cmd_save_app_settings(
        state: State<'_, AppState>,
        settings: AppSettings,
    ) -> std::result::Result<(), String> {
        state.save_settings(&settings).map_err(|e| e.to_string())
    }
}

pub fn run() {
    env_logger::init();
    log::info!("Starting MeshDesk Desktop Shell...");

    let app_state = match AppState::init_persistent() {
        Ok(state) => state,
        Err(e) => {
            log::error!("Failed to initialize persistent storage: {e}. Falling back to memory.");
            AppState::new_in_memory().expect("In-memory state creation failed")
        }
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_local_identity,
            commands::cmd_get_local_identity,
            commands::list_devices,
            commands::cmd_list_devices,
            commands::save_device,
            commands::cmd_save_device,
            commands::delete_device,
            commands::cmd_delete_device,
            commands::get_app_settings,
            commands::cmd_get_app_settings,
            commands::save_app_settings,
            commands::cmd_save_app_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_crud() {
        let state = AppState::new_in_memory().unwrap();
        let dev = Device::new("MD-1234-5678", "Host-1", "Windows 11");
        state.save_device(dev).unwrap();

        let list = state.list_devices().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "MD-1234-5678");

        let deleted = state.delete_device("MD-1234-5678").unwrap();
        assert!(deleted);
        assert_eq!(state.list_devices().unwrap().len(), 0);
    }
}
