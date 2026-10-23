use std::sync::Arc;
use meshdesk_core::{ConnectionType, Device, Result, SessionInfo, SessionState};
use meshdesk_identity::{IdentityInfo, NodeIdentity};
use meshdesk_storage::Storage;

pub struct AppState {
    pub identity: Arc<NodeIdentity>,
    pub storage: Arc<Storage>,
}

impl AppState {
    pub fn new_in_memory() -> Result<Self> {
        let identity = Arc::new(NodeIdentity::generate());
        let storage = Arc::new(Storage::in_memory()?);
        Ok(Self { identity, storage })
    }

    pub fn new_with_storage(storage_path: &str) -> Result<Self> {
        let identity = Arc::new(NodeIdentity::generate());
        let storage = Arc::new(Storage::open(storage_path)?);
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

    pub fn simulate_connect(&self, target_id: &str, target_name: &str) -> SessionInfo {
        let mut session = SessionInfo::new(target_id, target_name, ConnectionType::Lan, true);
        session.state = SessionState::Connected;
        session.latency_ms = Some(18);
        session.fps = Some(60);
        session
    }
}
