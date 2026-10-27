use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info};
use meshdesk_core::{MeshDeskError, Result};
use meshdesk_protocol::InputKind;
use meshdesk_stream::{InputInjector, ScreenCaptureEngine};
use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use crate::session::{HostIncomingSessionEvent, HostSessionDisconnectedEvent};

pub const DEFAULT_WEB_VIEWER_PORT: u16 = 48123;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum WebInputEvent {
    #[serde(rename = "mousemove")]
    MouseMove { x_norm: f32, y_norm: f32 },
    #[serde(rename = "mousedown")]
    MouseDown { button: u8 },
    #[serde(rename = "mouseup")]
    MouseUp { button: u8 },
    #[serde(rename = "wheel")]
    Wheel { delta: i32 },
    #[serde(rename = "keydown")]
    KeyDown { vk: u32, key: Option<String> },
    #[serde(rename = "keyup")]
    KeyUp { vk: u32, key: Option<String> },
}

pub struct WebViewerServer {
    listen_port: u16,
    host_id: String,
    allow_remote_control: Arc<AtomicBool>,
    is_running: Arc<AtomicBool>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl WebViewerServer {
    pub fn new(
        host_id: &str,
        listen_port: u16,
        allow_remote_control: Arc<AtomicBool>,
    ) -> Self {
        Self {
            listen_port,
            host_id: host_id.to_string(),
            allow_remote_control,
            is_running: Arc::new(AtomicBool::new(false)),
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_app_handle(&self, handle: AppHandle) {
        let mut guard = self.app_handle.write().await;
        *guard = Some(handle);
    }

    pub fn port(&self) -> u16 {
        self.listen_port
    }

    pub async fn start(&self) -> Result<()> {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return Ok(());
        }

        let bind_addr = format!("0.0.0.0:{}", self.listen_port);
        let listener = TcpListener::bind(&bind_addr).await.map_err(|e| {
            MeshDeskError::NetworkError(format!(
                "Failed to bind Web Viewer HTTP/WebSocket listener to {bind_addr}: {e}"
            ))
        })?;

        info!("MeshDesk HTML5 Web Viewer listening on http://{bind_addr}");

        let allow_control = Arc::clone(&self.allow_remote_control);
        let is_running = Arc::clone(&self.is_running);
        let app_handle = Arc::clone(&self.app_handle);
        let host_id = self.host_id.clone();

        tokio::spawn(async move {
            while is_running.load(Ordering::Relaxed) {
                match listener.accept().await {
                    Ok((stream, client_addr)) => {
                        let consent = Arc::clone(&allow_control);
                        let app_h = Arc::clone(&app_handle);
                        let h_id = host_id.clone();

                        tokio::spawn(async move {
                            if let Err(e) = handle_web_connection(stream, client_addr, h_id, consent, app_h).await {
                                debug!("Web viewer connection finished: {e}");
                            }
                        });
                    }
                    Err(e) => {
                        error!("Web Viewer accept error: {e}");
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

async fn handle_web_connection(
    mut stream: TcpStream,
    client_addr: SocketAddr,
    host_id: String,
    allow_control: Arc<AtomicBool>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
) -> Result<()> {
    let mut peek_buf = [0u8; 1024];
    let n = stream.peek(&mut peek_buf).await.map_err(|e| {
        MeshDeskError::NetworkError(format!("Failed to peek incoming stream: {e}"))
    })?;

    let header_str = String::from_utf8_lossy(&peek_buf[..n]);

    if header_str.contains("Upgrade: websocket") || header_str.contains("upgrade: websocket") {
        // Upgrade to WebSocket for live screen stream & remote inputs
        handle_websocket_session(stream, client_addr, host_id, allow_control, app_handle).await
    } else {
        // Serve embedded HTML5 Web Viewer
        let mut read_buf = [0u8; 2048];
        let _ = stream.read(&mut read_buf).await;

        let html = include_str!("../templates/web_viewer.html");
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
            html.len(),
            html
        );

        stream.write_all(response.as_bytes()).await.map_err(|e| {
            MeshDeskError::NetworkError(format!("Failed to write HTTP response: {e}"))
        })?;
        stream.flush().await.ok();
        Ok(())
    }
}

async fn handle_websocket_session(
    stream: TcpStream,
    client_addr: SocketAddr,
    _host_id: String,
    allow_control: Arc<AtomicBool>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
) -> Result<()> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await.map_err(|e| {
        MeshDeskError::NetworkError(format!("WebSocket handshake failed: {e}"))
    })?;

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let session_id = format!("web-sess-{}", rand::random::<u32>());
    let client_ip = client_addr.ip().to_string();

    info!("HTML5 Web Viewer connected: session {session_id} from {client_ip}");

    // Emit notification to host desktop app window
    if let Some(app) = app_handle.read().await.as_ref() {
        let event = HostIncomingSessionEvent {
            session_id: session_id.clone(),
            client_device_id: format!("Browser Web Viewer ({})", client_addr.ip()),
            client_ip: client_ip.clone(),
            granted_permissions: vec!["view".into(), "control".into()],
        };
        let _ = app.emit("host-incoming-session", event);
    }

    let is_active = Arc::new(AtomicBool::new(true));

    // Task 1: Frame capture and streaming loop (binary JPEG directly over WebSocket)
    let is_active_stream = Arc::clone(&is_active);
    let (frame_tx, mut frame_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(2);

    tokio::spawn(async move {
        let capture = ScreenCaptureEngine::new(75);
        while is_active_stream.load(Ordering::Relaxed) {
            let start = tokio::time::Instant::now();

            let (_w, _h, jpeg_bytes) = match capture.capture_frame() {
                Ok(frame) => frame,
                Err(_) => capture
                    .capture_fallback_pattern()
                    .unwrap_or((1280, 720, vec![])),
            };

            if frame_tx.try_send(jpeg_bytes).is_err() {
                // Drop frame if consumer queue full to keep latency minimal
            }

            let elapsed = start.elapsed();
            if elapsed < Duration::from_millis(41) {
                tokio::time::sleep(Duration::from_millis(41) - elapsed).await;
            }
        }
    });

    let is_active_sender = Arc::clone(&is_active);
    tokio::spawn(async move {
        while is_active_sender.load(Ordering::Relaxed) {
            if let Some(jpeg) = frame_rx.recv().await {
                if let Err(e) = ws_sender.send(WsMessage::Binary(jpeg.into())).await {
                    debug!("Web viewer WS send closed: {e}");
                    break;
                }
            } else {
                break;
            }
        }
        is_active_sender.store(false, Ordering::SeqCst);
    });

    // Task 2: Input receiver loop from browser (mouse, touch, keyboard)
    let is_active_input = Arc::clone(&is_active);
    let injector = InputInjector::new(allow_control.load(Ordering::Relaxed));

    while is_active_input.load(Ordering::Relaxed) {
        match ws_receiver.next().await {
            Some(Ok(WsMessage::Text(text))) => {
                if let Ok(event) = serde_json::from_str::<WebInputEvent>(&text) {
                    match event {
                        WebInputEvent::MouseMove { x_norm, y_norm } => {
                            let _ = injector.inject(&InputKind::MouseMove { x_norm, y_norm }, 1920, 1080);
                        }
                        WebInputEvent::MouseDown { button } => {
                            let btn = if button == 0 { 1 } else if button == 2 { 2 } else { 3 };
                            let _ = injector.inject(&InputKind::MouseDown { button: btn }, 1920, 1080);
                        }
                        WebInputEvent::MouseUp { button } => {
                            let btn = if button == 0 { 1 } else if button == 2 { 2 } else { 3 };
                            let _ = injector.inject(&InputKind::MouseUp { button: btn }, 1920, 1080);
                        }
                        WebInputEvent::Wheel { delta } => {
                            let _ = injector.inject(&InputKind::MouseWheel { delta }, 1920, 1080);
                        }
                        WebInputEvent::KeyDown { vk, key } => {
                            let key_str = key.unwrap_or_default();
                            let _ = injector.inject(&InputKind::KeyDown { vk, key: key_str }, 1920, 1080);
                        }
                        WebInputEvent::KeyUp { vk, key } => {
                            let key_str = key.unwrap_or_default();
                            let _ = injector.inject(&InputKind::KeyUp { vk, key: key_str }, 1920, 1080);
                        }
                    }
                }
            }
            Some(Ok(WsMessage::Ping(_payload))) => {
                // Ping-pong handled automatically
            }
            Some(Ok(WsMessage::Close(_))) | None => {
                break;
            }
            Some(Err(e)) => {
                debug!("Web viewer WS receive error: {e}");
                break;
            }
            _ => {}
        }
    }

    is_active.store(false, Ordering::SeqCst);

    // Emit disconnect event to Host desktop window
    if let Some(app) = app_handle.read().await.as_ref() {
        let event = HostSessionDisconnectedEvent {
            session_id: session_id.clone(),
            client_device_id: format!("Browser Web Viewer ({client_ip})"),
            reason: "Browser disconnected".into(),
        };
        let _ = app.emit("host-session-disconnected", event);
    }

    info!("HTML5 Web Viewer session {session_id} closed.");
    Ok(())
}
