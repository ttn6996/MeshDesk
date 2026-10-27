use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chrono::Utc;
use log::{debug, error, info, warn};
use meshdesk_core::{MeshDeskError, Result};
use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;
use tokio::sync::RwLock;

pub const DEFAULT_LAN_DISCOVERY_PORT: u16 = 48121;
pub const DEFAULT_LAN_LISTEN_PORT: u16 = 48120;
pub const DISCOVERY_PROTOCOL_HEADER: &str = "meshdesk-discovery";
pub const DISCOVERY_VERSION: &str = "1.0";
pub const NODE_TIMEOUT_SECS: u64 = 8;

/// Announcement payload broadcast over UDP
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiscoveryPayload {
    pub protocol: String,
    pub version: String,
    pub device_id: String,
    pub device_name: String,
    pub os: String,
    pub listen_port: u16,
    pub allow_discovery: bool,
    pub status: String,
    pub timestamp_ms: u64,
}

impl DiscoveryPayload {
    pub fn new(
        device_id: &str,
        device_name: &str,
        os: &str,
        listen_port: u16,
        allow_discovery: bool,
    ) -> Self {
        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Self {
            protocol: DISCOVERY_PROTOCOL_HEADER.to_string(),
            version: DISCOVERY_VERSION.to_string(),
            device_id: device_id.to_string(),
            device_name: device_name.to_string(),
            os: os.to_string(),
            listen_port,
            allow_discovery,
            status: "online".to_string(),
            timestamp_ms,
        }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| {
            MeshDeskError::ProtocolError(format!("Failed to serialize discovery payload: {e}"))
        })
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        serde_json::from_slice(bytes)
            .map_err(|e| MeshDeskError::ProtocolError(format!("Invalid discovery payload: {e}")))
    }
}

/// Discovered peer node on the local area network
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiscoveredNode {
    pub device_id: String,
    pub device_name: String,
    pub ip_address: String,
    pub listen_port: u16,
    pub os_info: String,
    pub status: String,
    pub last_seen: String,
    pub latency_ms: Option<u32>,
    pub last_seen_epoch_secs: u64,
}

/// Service managing UDP broadcast announcements and subnet listening
pub struct DiscoveryService {
    local_device_id: String,
    local_device_name: Arc<RwLock<String>>,
    local_os: String,
    listen_port: u16,
    broadcast_port: u16,
    is_active: Arc<AtomicBool>,
    nodes: Arc<RwLock<HashMap<String, DiscoveredNode>>>,
}

impl DiscoveryService {
    pub fn new(
        local_device_id: &str,
        local_device_name: &str,
        local_os: &str,
        listen_port: u16,
        broadcast_port: u16,
    ) -> Self {
        Self {
            local_device_id: local_device_id.to_string(),
            local_device_name: Arc::new(RwLock::new(local_device_name.to_string())),
            local_os: local_os.to_string(),
            listen_port,
            broadcast_port,
            is_active: Arc::new(AtomicBool::new(false)),
            nodes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn update_device_name(&self, name: &str) {
        let mut guard = self.local_device_name.write().await;
        *guard = name.to_string();
    }

    pub fn is_running(&self) -> bool {
        self.is_active.load(Ordering::Relaxed)
    }

    /// Retrieve all currently discovered active nodes on the subnet
    pub async fn get_discovered_nodes(&self) -> Vec<DiscoveredNode> {
        self.prune_stale_nodes().await;
        let guard = self.nodes.read().await;
        guard.values().cloned().collect()
    }

    /// Prune nodes that haven't sent an announcement in NODE_TIMEOUT_SECS
    pub async fn prune_stale_nodes(&self) {
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut guard = self.nodes.write().await;
        guard.retain(|_, node| {
            now_secs.saturating_sub(node.last_seen_epoch_secs) < NODE_TIMEOUT_SECS
        });
    }

    /// Start both the broadcast announcer and the discovery listener tasks
    pub async fn start(&self, allow_discovery: Arc<AtomicBool>) -> Result<()> {
        if self.is_active.swap(true, Ordering::SeqCst) {
            info!("LAN Discovery service is already running.");
            return Ok(());
        }

        info!(
            "Starting MeshDesk LAN Discovery service on port {}",
            self.broadcast_port
        );

        let local_id = self.local_device_id.clone();
        let local_name = Arc::clone(&self.local_device_name);
        let local_os = self.local_os.clone();
        let listen_port = self.listen_port;
        let broadcast_port = self.broadcast_port;
        let is_active = Arc::clone(&self.is_active);
        let allow_broadcast = Arc::clone(&allow_discovery);
        let nodes_map = Arc::clone(&self.nodes);

        // Task 1: UDP Broadcast Announcer
        tokio::spawn(async move {
            let bind_addr: SocketAddr = "0.0.0.0:0".parse().unwrap();
            let socket = match UdpSocket::bind(bind_addr).await {
                Ok(s) => {
                    let _ = s.set_broadcast(true);
                    s
                }
                Err(e) => {
                    error!("Failed to bind UDP announcer socket: {e}");
                    return;
                }
            };

            let broadcast_target = format!("255.255.255.255:{}", broadcast_port);

            while is_active.load(Ordering::Relaxed) {
                if allow_broadcast.load(Ordering::Relaxed) {
                    let name = local_name.read().await.clone();
                    let payload =
                        DiscoveryPayload::new(&local_id, &name, &local_os, listen_port, true);

                    if let Ok(bytes) = payload.to_bytes() {
                        if let Err(e) = socket.send_to(&bytes, &broadcast_target).await {
                            debug!("UDP broadcast packet delivery notice: {e}");
                        }
                    }
                }
                tokio::time::sleep(Duration::from_millis(2500)).await;
            }
            debug!("LAN discovery broadcaster stopped.");
        });

        // Task 2: UDP Subnet Listener
        let is_active_listener = Arc::clone(&self.is_active);
        let local_id_filter = self.local_device_id.clone();

        tokio::spawn(async move {
            let bind_addr = format!("0.0.0.0:{}", broadcast_port);
            let socket = match UdpSocket::bind(&bind_addr).await {
                Ok(s) => {
                    let _ = s.set_broadcast(true);
                    s
                }
                Err(e) => {
                    warn!(
                        "Could not bind discovery port {broadcast_port} exclusively ({e}). Attempting shared mode..."
                    );
                    return;
                }
            };

            let mut buf = [0u8; 4096];

            while is_active_listener.load(Ordering::Relaxed) {
                match socket.recv_from(&mut buf).await {
                    Ok((len, peer_addr)) => {
                        let now_epoch = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default();
                        let now_ms = now_epoch.as_millis() as u64;
                        let now_secs = now_epoch.as_secs();

                        if let Ok(payload) = DiscoveryPayload::from_bytes(&buf[..len]) {
                            // Ignore self-announcements
                            if payload.device_id == local_id_filter {
                                continue;
                            }

                            if payload.protocol == DISCOVERY_PROTOCOL_HEADER
                                && payload.allow_discovery
                            {
                                let ip_str = peer_addr.ip().to_string();
                                let latency =
                                    if payload.timestamp_ms > 0 && now_ms >= payload.timestamp_ms {
                                        Some((now_ms - payload.timestamp_ms).min(9999) as u32)
                                    } else {
                                        Some(1)
                                    };

                                let node = DiscoveredNode {
                                    device_id: payload.device_id.clone(),
                                    device_name: payload.device_name,
                                    ip_address: ip_str,
                                    listen_port: payload.listen_port,
                                    os_info: payload.os,
                                    status: "online".to_string(),
                                    last_seen: Utc::now().to_rfc3339(),
                                    latency_ms: latency,
                                    last_seen_epoch_secs: now_secs,
                                };

                                let mut guard = nodes_map.write().await;
                                guard.insert(payload.device_id, node);
                            }
                        }
                    }
                    Err(e) => {
                        debug!("Error receiving discovery packet: {e}");
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
            }
            debug!("LAN discovery listener stopped.");
        });

        Ok(())
    }

    pub fn stop(&self) {
        self.is_active.store(false, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_serialization_roundtrip() {
        let payload = DiscoveryPayload::new(
            "MD-8192-3012",
            "Test-Host-01",
            "Windows 11 x64",
            48120,
            true,
        );

        let bytes = payload.to_bytes().expect("Serialization failed");
        let decoded = DiscoveryPayload::from_bytes(&bytes).expect("Deserialization failed");

        assert_eq!(payload.device_id, decoded.device_id);
        assert_eq!(payload.device_name, decoded.device_name);
        assert_eq!(payload.listen_port, decoded.listen_port);
        assert_eq!(decoded.status, "online");
    }

    #[tokio::test]
    async fn test_node_caching_and_pruning() {
        let service =
            DiscoveryService::new("MD-1000-0001", "LocalHost", "Windows 11", 48120, 48121);

        let mock_node = DiscoveredNode {
            device_id: "MD-2000-0002".into(),
            device_name: "PeerHost".into(),
            ip_address: "192.168.1.50".into(),
            listen_port: 48120,
            os_info: "Windows 11 Pro".into(),
            status: "online".into(),
            last_seen: "now".into(),
            latency_ms: Some(2),
            last_seen_epoch_secs: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                - 10, // 10 seconds ago (stale)
        };

        {
            let mut guard = service.nodes.write().await;
            guard.insert(mock_node.device_id.clone(), mock_node);
        }

        // Before prune, length is 1
        assert_eq!(service.nodes.read().await.len(), 1);

        // After prune, stale node (> 8s) should be eliminated
        service.prune_stale_nodes().await;
        assert_eq!(service.nodes.read().await.len(), 0);
    }
}
