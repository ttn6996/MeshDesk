use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::prelude::*;
use log::{debug, error, info, warn};
use meshdesk_core::{MeshDeskError, Result};
use meshdesk_protocol::{FrameCodec, InputKind, Message};
use meshdesk_stream::{InputInjector, ScreenCaptureEngine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, RwLock};

/// Event emitted to the frontend webview when a new video frame is received
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFrameEvent {
    pub session_id: String,
    pub seq: u64,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub data_b64: String,
    pub timestamp_ms: u64,
    pub latency_ms: u32,
    pub fps: u32,
}

/// Helper to read length-prefixed frame from an async stream
async fn read_frame<R: AsyncReadExt + Unpin>(reader: &mut R) -> Result<Message> {
    let mut header = [0u8; 10];
    reader
        .read_exact(&mut header)
        .await
        .map_err(|e| MeshDeskError::NetworkError(format!("Failed to read frame header: {e}")))?;

    if header[0..4] != meshdesk_protocol::PROTOCOL_MAGIC {
        return Err(MeshDeskError::ProtocolError("Invalid magic header".into()));
    }

    let len = u32::from_be_bytes([header[6], header[7], header[8], header[9]]) as usize;
    if len > meshdesk_protocol::MAX_FRAME_SIZE {
        return Err(MeshDeskError::ProtocolError(format!(
            "Frame size {len} exceeds limit"
        )));
    }

    let mut buf = vec![0u8; 10 + len];
    buf[0..10].copy_from_slice(&header);
    reader
        .read_exact(&mut buf[10..])
        .await
        .map_err(|e| MeshDeskError::NetworkError(format!("Failed to read frame payload: {e}")))?;

    FrameCodec::decode(&buf)
}

/// Helper to write length-prefixed frame to an async stream
async fn write_frame<W: AsyncWriteExt + Unpin>(writer: &mut W, msg: &Message) -> Result<()> {
    let bytes = FrameCodec::encode(msg)?;
    writer
        .write_all(&bytes)
        .await
        .map_err(|e| MeshDeskError::NetworkError(format!("Failed to write frame: {e}")))?;
    writer
        .flush()
        .await
        .map_err(|e| MeshDeskError::NetworkError(format!("Failed to flush stream: {e}")))?;
    Ok(())
}

/// Active Client Controller session connected to a remote host
pub struct ClientSession {
    pub session_id: String,
    pub target_device_id: String,
    pub target_device_name: String,
    pub is_connected: Arc<AtomicBool>,
    input_tx: mpsc::Sender<InputKind>,
    disconnect_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl ClientSession {
    pub async fn send_input(&self, input: InputKind) -> Result<()> {
        if !self.is_connected.load(Ordering::Relaxed) {
            return Err(MeshDeskError::SessionError(
                "Session is disconnected".into(),
            ));
        }
        self.input_tx
            .send(input)
            .await
            .map_err(|e| MeshDeskError::SessionError(format!("Failed to send input: {e}")))
    }

    pub fn disconnect(&mut self) {
        self.is_connected.store(false, Ordering::SeqCst);
        if let Some(tx) = self.disconnect_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// Connects to a remote host, performs challenge-response authentication, and handles real-time streaming
pub async fn connect_to_remote_host(
    app_handle: AppHandle,
    host_addr: &str,
    target_device_id: &str,
    target_name: &str,
    client_id: &str,
    access_password: &str,
) -> Result<ClientSession> {
    info!("Connecting to remote MeshDesk host at {host_addr}...");
    let stream = TcpStream::connect(host_addr).await.map_err(|e| {
        MeshDeskError::NetworkError(format!("Failed to connect to host {host_addr}: {e}"))
    })?;

    let (mut reader, mut writer) = stream.into_split();

    // 1. Send Hello
    let nonce = format!("{:x}", rand::random::<u128>());
    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let hello = Message::Hello {
        protocol_version: "1.0.0".into(),
        client_device_id: client_id.to_string(),
        nonce: nonce.clone(),
        timestamp: now_ts,
    };
    write_frame(&mut writer, &hello).await?;

    // 2. Read HelloAck
    let ack = read_frame(&mut reader).await?;
    let (salt, host_nonce) = match ack {
        Message::HelloAck { salt, nonce, .. } => (salt, nonce),
        Message::AuthFailure { message, .. } => {
            return Err(MeshDeskError::AuthenticationFailed(message));
        }
        other => {
            return Err(MeshDeskError::ProtocolError(format!(
                "Expected HelloAck, received: {:?}",
                other
            )));
        }
    };

    // 3. Compute challenge proof: blake3(salt + password + host_nonce)
    let proof = blake3::hash(format!("{}:{}:{}", salt, access_password, host_nonce).as_bytes())
        .to_hex()
        .to_string();

    let session_request_id = uuid::Uuid::new_v4().to_string();
    let auth_resp = Message::AuthChallengeResponse {
        session_request_id,
        auth_proof: proof,
        desired_permissions: vec!["view".into(), "control".into()],
    };
    write_frame(&mut writer, &auth_resp).await?;

    // 4. Read AuthSuccess or AuthFailure
    let auth_result = read_frame(&mut reader).await?;
    let session_id = match auth_result {
        Message::AuthSuccess { session_id, .. } => {
            info!("Authentication successful! Established session: {session_id}");
            session_id
        }
        Message::AuthFailure { message, .. } => {
            return Err(MeshDeskError::AuthenticationFailed(message));
        }
        other => {
            return Err(MeshDeskError::ProtocolError(format!(
                "Expected AuthSuccess, received: {:?}",
                other
            )));
        }
    };

    let is_connected = Arc::new(AtomicBool::new(true));
    let (input_tx, mut input_rx) = mpsc::channel::<InputKind>(128);
    let (disconnect_tx, mut disconnect_rx) = tokio::sync::oneshot::channel::<()>();

    // Task A: Write outgoing InputEvents to host
    let is_connected_writer = Arc::clone(&is_connected);
    let sess_id_writer = session_id.clone();
    tokio::spawn(async move {
        let mut seq = 0u64;
        while is_connected_writer.load(Ordering::Relaxed) {
            tokio::select! {
                Some(input) = input_rx.recv() => {
                    seq += 1;
                    let msg = Message::InputEvent {
                        session_id: sess_id_writer.clone(),
                        seq,
                        input,
                    };
                    if let Err(e) = write_frame(&mut writer, &msg).await {
                        debug!("Error sending input event: {e}");
                        break;
                    }
                }
                _ = &mut disconnect_rx => {
                    let _ = write_frame(&mut writer, &Message::Disconnect {
                        session_id: sess_id_writer.clone(),
                        reason: "User closed session".into(),
                    }).await;
                    break;
                }
            }
        }
        is_connected_writer.store(false, Ordering::SeqCst);
    });

    // Task B: Read incoming VideoFrames from host and emit to Tauri webview
    let is_connected_reader = Arc::clone(&is_connected);
    let sess_id_reader = session_id.clone();
    let app = app_handle.clone();
    tokio::spawn(async move {
        let mut frame_count = 0u32;
        let mut fps = 0u32;
        let mut last_fps_time = Instant::now();

        while is_connected_reader.load(Ordering::Relaxed) {
            match read_frame(&mut reader).await {
                Ok(Message::VideoFrame {
                    session_id,
                    seq,
                    timestamp_ms,
                    width,
                    height,
                    format,
                    data_b64,
                }) => {
                    frame_count += 1;
                    if last_fps_time.elapsed() >= Duration::from_secs(1) {
                        fps = frame_count;
                        frame_count = 0;
                        last_fps_time = Instant::now();
                    }

                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let latency_ms = if timestamp_ms > 0 && now_ms >= timestamp_ms {
                        (now_ms - timestamp_ms).min(9999) as u32
                    } else {
                        1
                    };

                    let event = SessionFrameEvent {
                        session_id,
                        seq,
                        width,
                        height,
                        format,
                        data_b64,
                        timestamp_ms,
                        latency_ms,
                        fps,
                    };

                    let _ = app.emit("session-frame", event);
                }
                Ok(Message::Disconnect { reason, .. }) => {
                    info!("Remote host terminated session: {reason}");
                    break;
                }
                Ok(_) => {}
                Err(e) => {
                    debug!("Frame stream closed or error: {e}");
                    break;
                }
            }
        }
        is_connected_reader.store(false, Ordering::SeqCst);
        let _ = app.emit("session-disconnected", sess_id_reader);
    });

    Ok(ClientSession {
        session_id,
        target_device_id: target_device_id.to_string(),
        target_device_name: target_name.to_string(),
        is_connected,
        input_tx,
        disconnect_tx: Some(disconnect_tx),
    })
}

/// Host Server listening on TCP port 48120 to accept controller connections
pub struct HostServer {
    host_id: String,
    host_name: Arc<RwLock<String>>,
    listen_port: u16,
    access_password: Arc<RwLock<String>>,
    allow_remote_control: Arc<AtomicBool>,
    is_running: Arc<AtomicBool>,
}

impl HostServer {
    pub fn new(
        host_id: &str,
        host_name: &str,
        listen_port: u16,
        access_password: &str,
        allow_remote_control: Arc<AtomicBool>,
    ) -> Self {
        Self {
            host_id: host_id.to_string(),
            host_name: Arc::new(RwLock::new(host_name.to_string())),
            listen_port,
            access_password: Arc::new(RwLock::new(access_password.to_string())),
            allow_remote_control,
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub async fn update_password(&self, new_pw: &str) {
        let mut guard = self.access_password.write().await;
        *guard = new_pw.to_string();
    }

    pub async fn get_password(&self) -> String {
        self.access_password.read().await.clone()
    }

    pub async fn start(&self) -> Result<()> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        let bind_addr = format!("0.0.0.0:{}", self.listen_port);
        let listener = TcpListener::bind(&bind_addr).await.map_err(|e| {
            MeshDeskError::NetworkError(format!(
                "Failed to bind TCP host listener to {bind_addr}: {e}"
            ))
        })?;

        info!("MeshDesk Host Server listening for incoming remote sessions on {bind_addr}");

        let host_id = self.host_id.clone();
        let host_name = Arc::clone(&self.host_name);
        let password_arc = Arc::clone(&self.access_password);
        let allow_control = Arc::clone(&self.allow_remote_control);
        let is_running = Arc::clone(&self.is_running);

        tokio::spawn(async move {
            while is_running.load(Ordering::Relaxed) {
                match listener.accept().await {
                    Ok((stream, client_addr)) => {
                        info!("Incoming connection from controller: {client_addr}");
                        let h_id = host_id.clone();
                        let h_name = host_name.read().await.clone();
                        let pw = password_arc.read().await.clone();
                        let consent = Arc::clone(&allow_control);

                        tokio::spawn(async move {
                            if let Err(e) =
                                handle_incoming_controller(stream, h_id, h_name, pw, consent).await
                            {
                                warn!("Controller session ended with notice: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        error!("TCP accept error: {e}");
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
            }
        });

        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}

/// Handles handshake and streaming for an incoming controller connection
async fn handle_incoming_controller(
    stream: TcpStream,
    host_id: String,
    host_name: String,
    access_password: String,
    allow_control: Arc<AtomicBool>,
) -> Result<()> {
    let (mut reader, mut writer) = stream.into_split();

    // 1. Read Hello
    let hello = read_frame(&mut reader).await?;
    let (client_id, _client_nonce) = match hello {
        Message::Hello {
            client_device_id,
            nonce,
            ..
        } => (client_device_id, nonce),
        _ => return Err(MeshDeskError::ProtocolError("Expected Hello frame".into())),
    };

    // 2. Send HelloAck with salt and host nonce
    let salt = format!("{:x}", rand::random::<u128>());
    let host_nonce = format!("{:x}", rand::random::<u128>());
    let ack = Message::HelloAck {
        protocol_version: "1.0.0".into(),
        host_device_id: host_id,
        host_name,
        salt: salt.clone(),
        nonce: host_nonce.clone(),
    };
    write_frame(&mut writer, &ack).await?;

    // 3. Read AuthChallengeResponse
    let auth_msg = read_frame(&mut reader).await?;
    let received_proof = match auth_msg {
        Message::AuthChallengeResponse { auth_proof, .. } => auth_proof,
        _ => {
            return Err(MeshDeskError::ProtocolError(
                "Expected AuthChallengeResponse".into(),
            ))
        }
    };

    // Verify challenge proof
    let expected_proof =
        blake3::hash(format!("{}:{}:{}", salt, access_password, host_nonce).as_bytes())
            .to_hex()
            .to_string();

    if received_proof != expected_proof {
        let fail = Message::AuthFailure {
            code: "INVALID_CREDENTIALS".into(),
            message: "Access password challenge verification failed".into(),
            retry_after_secs: 3,
        };
        let _ = write_frame(&mut writer, &fail).await;
        return Err(MeshDeskError::AuthenticationFailed(
            "Invalid access password".into(),
        ));
    }

    if !allow_control.load(Ordering::Relaxed) {
        let fail = Message::AuthFailure {
            code: "REMOTE_CONTROL_DISABLED".into(),
            message: "Host user has disabled remote control in Settings".into(),
            retry_after_secs: 5,
        };
        let _ = write_frame(&mut writer, &fail).await;
        return Err(MeshDeskError::SessionError(
            "Host disabled remote control".into(),
        ));
    }

    // 4. Send AuthSuccess
    let session_id = format!("sess-{}", rand::random::<u32>());
    let auth_ok = Message::AuthSuccess {
        session_id: session_id.clone(),
        session_token: uuid::Uuid::new_v4().to_string(),
        expires_in_seconds: 3600,
        granted_permissions: vec!["view".into(), "control".into()],
        display_width: 1920,
        display_height: 1080,
    };
    write_frame(&mut writer, &auth_ok).await?;

    info!("Authorized remote session {session_id} from {client_id}");

    let is_active = Arc::new(AtomicBool::new(true));

    // Task 1: Frame capture and streaming loop (captures desktop at ~24 FPS)
    let is_active_stream = Arc::clone(&is_active);
    let sess_id_stream = session_id.clone();
    tokio::spawn(async move {
        let capture = ScreenCaptureEngine::new(75);
        let mut seq = 0u64;

        while is_active_stream.load(Ordering::Relaxed) {
            let start = Instant::now();

            let (w, h, jpeg_bytes) = match capture.capture_frame() {
                Ok(frame) => frame,
                Err(e) => {
                    debug!("Capture fallback: {e}");
                    capture
                        .capture_fallback_pattern()
                        .unwrap_or((1280, 720, vec![]))
                }
            };

            seq += 1;
            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            let data_b64 = BASE64_STANDARD.encode(&jpeg_bytes);
            let frame_msg = Message::VideoFrame {
                session_id: sess_id_stream.clone(),
                seq,
                timestamp_ms: now_ms,
                width: w,
                height: h,
                format: "jpeg".into(),
                data_b64,
            };

            if let Err(e) = write_frame(&mut writer, &frame_msg).await {
                debug!("Host streamer connection ended: {e}");
                break;
            }

            // Target ~24 FPS (41ms per frame interval)
            let elapsed = start.elapsed();
            if elapsed < Duration::from_millis(41) {
                tokio::time::sleep(Duration::from_millis(41) - elapsed).await;
            }
        }
        is_active_stream.store(false, Ordering::SeqCst);
    });

    // Task 2: Input receiver loop (receives mouse and keyboard events from controller)
    let is_active_input = Arc::clone(&is_active);
    let injector = InputInjector::new(allow_control.load(Ordering::Relaxed));

    while is_active_input.load(Ordering::Relaxed) {
        match read_frame(&mut reader).await {
            Ok(Message::InputEvent { input, .. }) => {
                if let Err(e) = injector.inject(&input, 1920, 1080) {
                    debug!("Input injection failed: {e}");
                }
            }
            Ok(Message::Disconnect { reason, .. }) => {
                info!("Client disconnected from host: {reason}");
                break;
            }
            Ok(_) => {}
            Err(e) => {
                debug!("Client input channel closed: {e}");
                break;
            }
        }
    }

    is_active.store(false, Ordering::SeqCst);
    info!("Session {session_id} concluded.");
    Ok(())
}
