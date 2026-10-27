use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use log::{debug, info, warn};
use meshdesk_core::{MeshDeskError, Result};
use meshdesk_protocol::SignalingMessage;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message as WsMessage;

pub const DEFAULT_SIGNALING_PORT: u16 = 48122;

/// A registered peer active on the signaling broker
#[derive(Clone)]
struct RegisteredPeer {
    device_id: String,
    hostname: String,
    tx: mpsc::UnboundedSender<SignalingMessage>,
}

/// Standalone and embedded WebSocket signaling server for rendezvous & WebRTC NAT traversal
pub struct SignalingServer {
    peers: Arc<RwLock<HashMap<String, RegisteredPeer>>>,
    listen_addr: SocketAddr,
    is_running: Arc<AtomicBool>,
}

impl SignalingServer {
    pub fn new(listen_addr: SocketAddr) -> Self {
        Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            listen_addr,
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn with_default_port() -> Self {
        let addr = SocketAddr::from(([0, 0, 0, 0], DEFAULT_SIGNALING_PORT));
        Self::new(addr)
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::Relaxed)
    }

    pub async fn registered_peer_count(&self) -> usize {
        self.peers.read().await.len()
    }

    pub async fn list_online_devices(&self) -> Vec<(String, String)> {
        self.peers
            .read()
            .await
            .values()
            .map(|p| (p.device_id.clone(), p.hostname.clone()))
            .collect()
    }

    /// Run the signaling server loop (terminates when cancellation flag is set)
    pub async fn run(&self) -> Result<()> {
        let listener = TcpListener::bind(self.listen_addr)
            .await
            .map_err(|e| MeshDeskError::NetworkError(format!("Signaling bind error: {e}")))?;

        self.is_running.store(true, Ordering::SeqCst);
        info!(
            "MeshDesk Signaling Server listening on ws://{}",
            self.listen_addr
        );

        let peers = Arc::clone(&self.peers);
        let is_running = Arc::clone(&self.is_running);

        while is_running.load(Ordering::SeqCst) {
            match listener.accept().await {
                Ok((stream, client_addr)) => {
                    debug!("Signaling client connected from: {client_addr}");
                    let peers_clone = Arc::clone(&peers);
                    tokio::spawn(async move {
                        if let Err(e) = Self::handle_connection(stream, peers_clone).await {
                            debug!("Signaling connection terminated: {e}");
                        }
                    });
                }
                Err(e) => {
                    if !is_running.load(Ordering::SeqCst) {
                        break;
                    }
                    warn!("Signaling accept error: {e}");
                }
            }
        }

        info!("Signaling Server stopped.");
        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }

    async fn handle_connection(
        stream: TcpStream,
        peers: Arc<RwLock<HashMap<String, RegisteredPeer>>>,
    ) -> Result<()> {
        let ws_stream = tokio_tungstenite::accept_async(stream)
            .await
            .map_err(|e| MeshDeskError::NetworkError(format!("WebSocket handshake failed: {e}")))?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();
        let (peer_tx, mut peer_rx) = mpsc::unbounded_channel::<SignalingMessage>();

        // Outbound task: forward messages from internal channel to WebSocket
        tokio::spawn(async move {
            while let Some(msg) = peer_rx.recv().await {
                if let Ok(json) = serde_json::to_string(&msg) {
                    if ws_sender.send(WsMessage::Text(json)).await.is_err() {
                        break;
                    }
                }
            }
        });

        let mut registered_device_id: Option<String> = None;

        // Inbound loop: handle messages from WebSocket
        while let Some(msg_res) = ws_receiver.next().await {
            match msg_res {
                Ok(WsMessage::Text(text)) => {
                    let sig_msg: SignalingMessage = match serde_json::from_str(&text) {
                        Ok(m) => m,
                        Err(e) => {
                            warn!("Invalid signaling message JSON: {e}");
                            continue;
                        }
                    };

                    match sig_msg {
                        SignalingMessage::Register {
                            device_id,
                            hostname,
                            public_key_b64: _,
                            auth_token: _,
                        } => {
                            info!("Signaling peer registered: {device_id} ({hostname})");
                            registered_device_id = Some(device_id.clone());

                            let peer = RegisteredPeer {
                                device_id: device_id.clone(),
                                hostname: hostname.clone(),
                                tx: peer_tx.clone(),
                            };

                            let now_ms = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            // Send Registered confirmation
                            let _ = peer_tx.send(SignalingMessage::Registered {
                                device_id: device_id.clone(),
                                registered_at_epoch_ms: now_ms,
                            });

                            // Broadcast DeviceOnline to other peers
                            let mut guard = peers.write().await;
                            for (other_id, other_peer) in guard.iter() {
                                if other_id != &device_id {
                                    let _ = other_peer.tx.send(SignalingMessage::DeviceOnline {
                                        device_id: device_id.clone(),
                                        hostname: hostname.clone(),
                                    });
                                }
                            }
                            guard.insert(device_id, peer);
                        }

                        SignalingMessage::Offer {
                            sender_id,
                            target_id,
                            session_id,
                            sdp,
                        } => {
                            debug!("Routing Offer from {sender_id} to {target_id}");
                            Self::route_message(
                                &peers,
                                &target_id,
                                &peer_tx,
                                SignalingMessage::Offer {
                                    sender_id,
                                    target_id: target_id.clone(),
                                    session_id,
                                    sdp,
                                },
                            )
                            .await;
                        }

                        SignalingMessage::Answer {
                            sender_id,
                            target_id,
                            session_id,
                            sdp,
                        } => {
                            debug!("Routing Answer from {sender_id} to {target_id}");
                            Self::route_message(
                                &peers,
                                &target_id,
                                &peer_tx,
                                SignalingMessage::Answer {
                                    sender_id,
                                    target_id: target_id.clone(),
                                    session_id,
                                    sdp,
                                },
                            )
                            .await;
                        }

                        SignalingMessage::IceCandidate {
                            sender_id,
                            target_id,
                            session_id,
                            candidate,
                            sdp_mid,
                            sdp_mline_index,
                        } => {
                            Self::route_message(
                                &peers,
                                &target_id,
                                &peer_tx,
                                SignalingMessage::IceCandidate {
                                    sender_id,
                                    target_id: target_id.clone(),
                                    session_id,
                                    candidate,
                                    sdp_mid,
                                    sdp_mline_index,
                                },
                            )
                            .await;
                        }

                        SignalingMessage::RelayData {
                            sender_id,
                            target_id,
                            session_id,
                            payload_b64,
                        } => {
                            Self::route_message(
                                &peers,
                                &target_id,
                                &peer_tx,
                                SignalingMessage::RelayData {
                                    sender_id,
                                    target_id: target_id.clone(),
                                    session_id,
                                    payload_b64,
                                },
                            )
                            .await;
                        }

                        SignalingMessage::Ping => {
                            let _ = peer_tx.send(SignalingMessage::Pong);
                        }

                        _ => {}
                    }
                }
                Ok(WsMessage::Close(_)) => break,
                Err(_) => break,
                _ => {}
            }
        }

        // Clean up peer registration upon disconnect
        if let Some(id) = registered_device_id {
            info!("Signaling peer disconnected: {id}");
            let mut guard = peers.write().await;
            guard.remove(&id);
            for other_peer in guard.values() {
                let _ = other_peer.tx.send(SignalingMessage::DeviceOffline {
                    device_id: id.clone(),
                });
            }
        }

        Ok(())
    }

    async fn route_message(
        peers: &Arc<RwLock<HashMap<String, RegisteredPeer>>>,
        target_id: &str,
        caller_tx: &mpsc::UnboundedSender<SignalingMessage>,
        msg: SignalingMessage,
    ) {
        let guard = peers.read().await;
        if let Some(target_peer) = guard.get(target_id) {
            let _ = target_peer.tx.send(msg);
        } else {
            let _ = caller_tx.send(SignalingMessage::Error {
                code: "PEER_OFFLINE".into(),
                message: format!("Device '{target_id}' is not connected to signaling"),
            });
        }
    }
}

/// Client component for connecting to signaling server
pub struct SignalingClient {
    tx: mpsc::UnboundedSender<SignalingMessage>,
    event_tx: broadcast::Sender<SignalingMessage>,
    is_connected: Arc<AtomicBool>,
}

impl SignalingClient {
    /// Connect to remote signaling WebSocket server and register identity
    pub async fn connect(
        url: &str,
        local_device_id: &str,
        hostname: &str,
        public_key_b64: &str,
    ) -> Result<Self> {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url)
            .await
            .map_err(|e| MeshDeskError::NetworkError(format!("Signaling connect error: {e}")))?;

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<SignalingMessage>();
        let (event_tx, _) = broadcast::channel::<SignalingMessage>(64);
        let event_tx_clone = event_tx.clone();
        let is_connected = Arc::new(AtomicBool::new(true));
        let is_connected_clone = Arc::clone(&is_connected);

        // Send Register message immediately
        let register_msg = SignalingMessage::Register {
            device_id: local_device_id.to_string(),
            hostname: hostname.to_string(),
            public_key_b64: public_key_b64.to_string(),
            auth_token: None,
        };
        let reg_json = serde_json::to_string(&register_msg).unwrap();
        ws_sender
            .send(WsMessage::Text(reg_json))
            .await
            .map_err(|e| {
                MeshDeskError::NetworkError(format!("Signaling register send failed: {e}"))
            })?;

        // Outbound sender task
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Ok(json) = serde_json::to_string(&msg) {
                    if ws_sender.send(WsMessage::Text(json)).await.is_err() {
                        break;
                    }
                }
            }
        });

        // Inbound receiver task
        tokio::spawn(async move {
            while let Some(msg_res) = ws_receiver.next().await {
                match msg_res {
                    Ok(WsMessage::Text(text)) => {
                        if let Ok(sig_msg) = serde_json::from_str::<SignalingMessage>(&text) {
                            let _ = event_tx_clone.send(sig_msg);
                        }
                    }
                    Ok(WsMessage::Close(_)) => break,
                    Err(_) => break,
                    _ => {}
                }
            }
            is_connected_clone.store(false, Ordering::SeqCst);
        });

        Ok(Self {
            tx,
            event_tx,
            is_connected,
        })
    }

    pub fn is_connected(&self) -> bool {
        self.is_connected.load(Ordering::Relaxed)
    }

    pub fn send(&self, msg: SignalingMessage) -> Result<()> {
        self.tx
            .send(msg)
            .map_err(|e| MeshDeskError::NetworkError(format!("Signaling send error: {e}")))
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SignalingMessage> {
        self.event_tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_signaling_server_registration_and_routing() {
        // Find an open port
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
        let server = Arc::new(SignalingServer::new(addr));
        let server_clone = Arc::clone(&server);

        tokio::spawn(async move {
            let _ = server_clone.run().await;
        });

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let ws_url = format!("ws://127.0.0.1:{port}");

        // Client A
        let client_a = SignalingClient::connect(&ws_url, "MD-AAAA-1111", "Host-A", "pk_a")
            .await
            .expect("Client A failed to connect");
        let mut rx_a = client_a.subscribe();

        // Expect Registered
        let msg = rx_a.recv().await.unwrap();
        match msg {
            SignalingMessage::Registered { device_id, .. } => {
                assert_eq!(device_id, "MD-AAAA-1111");
            }
            other => panic!("Unexpected msg: {other:?}"),
        }

        // Client B
        let client_b = SignalingClient::connect(&ws_url, "MD-BBBB-2222", "Host-B", "pk_b")
            .await
            .expect("Client B failed to connect");
        let mut rx_b = client_b.subscribe();

        let _ = rx_b.recv().await.unwrap(); // Registered for B

        // Client A should receive DeviceOnline for B
        let online_msg = rx_a.recv().await.unwrap();
        match online_msg {
            SignalingMessage::DeviceOnline {
                device_id,
                hostname,
            } => {
                assert_eq!(device_id, "MD-BBBB-2222");
                assert_eq!(hostname, "Host-B");
            }
            other => panic!("Unexpected msg: {other:?}"),
        }

        // Send Offer from A to B
        client_a
            .send(SignalingMessage::Offer {
                sender_id: "MD-AAAA-1111".into(),
                target_id: "MD-BBBB-2222".into(),
                session_id: "test-sess-1".into(),
                sdp: "v=0\r\no=test".into(),
            })
            .unwrap();

        // B should receive Offer
        let offer_msg = rx_b.recv().await.unwrap();
        match offer_msg {
            SignalingMessage::Offer {
                sender_id,
                target_id,
                session_id,
                sdp,
            } => {
                assert_eq!(sender_id, "MD-AAAA-1111");
                assert_eq!(target_id, "MD-BBBB-2222");
                assert_eq!(session_id, "test-sess-1");
                assert_eq!(sdp, "v=0\r\no=test");
            }
            other => panic!("Unexpected msg: {other:?}"),
        }

        server.stop();
    }
}
