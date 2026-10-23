use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceStatus {
    Online,
    Offline,
    Busy,
    Connecting,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionMode {
    Auto,
    DirectLanOnly,
    InternetOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionType {
    Lan,
    InternetP2p,
    InternetRelay,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,                 // Stable device ID, e.g. "MD-7182-9304"
    pub name: String,               // User friendly name, e.g. "Workstation-Office"
    pub hostname: Option<String>,   // Optional hostname or LAN IP
    pub status: DeviceStatus,
    pub os_info: String,            // e.g. "Windows 11 Pro x64"
    pub last_seen: DateTime<Utc>,
    pub tags: Vec<String>,
    pub notes: Option<String>,
    pub latency_ms: Option<u32>,
    pub is_favorite: bool,
}

impl Device {
    pub fn new(id: impl Into<String>, name: impl Into<String>, os_info: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            hostname: None,
            status: DeviceStatus::Offline,
            os_info: os_info.into(),
            last_seen: Utc::now(),
            tags: Vec::new(),
            notes: None,
            latency_ms: None,
            is_favorite: false,
        }
    }
}
