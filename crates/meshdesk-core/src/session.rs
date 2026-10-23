use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::device::ConnectionType;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Disconnected,
    Resolving,
    Connecting,
    Authenticating,
    Connected,
    Reconnecting,
    Failed,
    Terminated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub target_device_id: String,
    pub target_device_name: String,
    pub connection_type: ConnectionType,
    pub state: SessionState,
    pub started_at: DateTime<Utc>,
    pub latency_ms: Option<u32>,
    pub fps: Option<u32>,
    pub bytes_received: u64,
    pub bytes_sent: u64,
    pub is_simulated: bool,
    pub error_message: Option<String>,
}

impl SessionInfo {
    pub fn new(
        target_device_id: impl Into<String>,
        target_device_name: impl Into<String>,
        connection_type: ConnectionType,
        is_simulated: bool,
    ) -> Self {
        Self {
            session_id: Uuid::new_v4().to_string(),
            target_device_id: target_device_id.into(),
            target_device_name: target_device_name.into(),
            connection_type,
            state: SessionState::Connecting,
            started_at: Utc::now(),
            latency_ms: None,
            fps: None,
            bytes_received: 0,
            bytes_sent: 0,
            is_simulated,
            error_message: None,
        }
    }
}
