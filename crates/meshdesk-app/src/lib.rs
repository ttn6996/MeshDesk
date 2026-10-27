use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use meshdesk_core::{AppSettings, ConnectionType, Device, Result, SessionInfo, SessionState};
use meshdesk_discovery::{
    DiscoveredNode, DiscoveryService, DEFAULT_LAN_DISCOVERY_PORT, DEFAULT_LAN_LISTEN_PORT,
};
use meshdesk_identity::{IdentityInfo, NodeIdentity};
use meshdesk_protocol::InputKind;
use meshdesk_signaling::{SignalingClient, SignalingServer, DEFAULT_SIGNALING_PORT};
use meshdesk_storage::Storage;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;

pub mod session;
pub mod web_viewer;
pub use session::{
    ClientSession, HostIncomingSessionEvent, HostServer, HostSessionDisconnectedEvent,
    SessionFrameEvent,
};
pub use web_viewer::{WebViewerServer, DEFAULT_WEB_VIEWER_PORT};

/// Get primary local LAN IPv4 address without external transmission
pub fn get_local_lan_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostAccessCredentials {
    pub device_id: String,
    pub access_password: String,
    pub listen_port: u16,
    pub web_viewer_port: u16,
    pub local_ip: String,
    pub allow_remote_control: bool,
    pub allow_lan_discovery: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalingStatusInfo {
    pub is_server_running: bool,
    pub is_client_connected: bool,
    pub server_addr: String,
    pub online_peers_count: usize,
}

pub struct AppState {
    pub identity: Arc<NodeIdentity>,
    pub storage: Arc<Storage>,
    pub discovery: Arc<DiscoveryService>,
    pub host_server: Arc<HostServer>,
    pub web_viewer: Arc<WebViewerServer>,
    pub signaling_server: Arc<SignalingServer>,
    pub signaling_client: Arc<RwLock<Option<SignalingClient>>>,
    pub active_client_session: Arc<RwLock<Option<ClientSession>>>,
    pub allow_remote_control: Arc<AtomicBool>,
    pub allow_lan_discovery: Arc<AtomicBool>,
    pub is_view_only: Arc<AtomicBool>,
    pub active_tab_session_id: Arc<RwLock<Option<String>>>,
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

        let settings = storage.get_settings().unwrap_or_default();
        let allow_remote_control = Arc::new(AtomicBool::new(settings.allow_remote_control));
        let allow_lan_discovery = Arc::new(AtomicBool::new(settings.enable_lan_discovery));

        let local_id = identity.info().device_id;
        let discovery = Arc::new(DiscoveryService::new(
            &local_id,
            &settings.device_name,
            "Windows 11 x64",
            settings.local_listen_port,
            settings.lan_discovery_port,
        ));

        // Generate 6-digit random temporary host password
        let default_password = format!("{:06}", (rand::random::<u32>() % 900_000) + 100_000);
        let host_server = Arc::new(HostServer::new(
            &local_id,
            &settings.device_name,
            settings.local_listen_port,
            &default_password,
            Arc::clone(&allow_remote_control),
        ));

        let web_viewer = Arc::new(WebViewerServer::new(
            &local_id,
            DEFAULT_WEB_VIEWER_PORT,
            Arc::clone(&allow_remote_control),
        ));

        let signaling_addr = std::net::SocketAddr::from(([0, 0, 0, 0], DEFAULT_SIGNALING_PORT));
        let signaling_server = Arc::new(SignalingServer::new(signaling_addr));
        let signaling_client = Arc::new(RwLock::new(None));
        let is_view_only = Arc::new(AtomicBool::new(false));
        let active_tab_session_id = Arc::new(RwLock::new(None));

        Ok(Self {
            identity: Arc::new(identity),
            storage: Arc::new(storage),
            discovery,
            host_server,
            web_viewer,
            signaling_server,
            signaling_client,
            active_client_session: Arc::new(RwLock::new(None)),
            allow_remote_control,
            allow_lan_discovery,
            is_view_only,
            active_tab_session_id,
        })
    }

    /// Initialize with in-memory database and fresh identity for unit testing
    pub fn new_in_memory() -> Result<Self> {
        let identity = Arc::new(NodeIdentity::generate());
        let storage = Arc::new(Storage::in_memory()?);
        let settings = storage.get_settings().unwrap_or_default();
        let allow_remote_control = Arc::new(AtomicBool::new(true));
        let allow_lan_discovery = Arc::new(AtomicBool::new(true));

        let local_id = identity.info().device_id;
        let discovery = Arc::new(DiscoveryService::new(
            &local_id,
            &settings.device_name,
            "Windows 11",
            DEFAULT_LAN_LISTEN_PORT,
            DEFAULT_LAN_DISCOVERY_PORT,
        ));

        let host_server = Arc::new(HostServer::new(
            &local_id,
            &settings.device_name,
            DEFAULT_LAN_LISTEN_PORT,
            "123456",
            Arc::clone(&allow_remote_control),
        ));

        let web_viewer = Arc::new(WebViewerServer::new(
            &local_id,
            DEFAULT_WEB_VIEWER_PORT,
            Arc::clone(&allow_remote_control),
        ));

        let signaling_addr = std::net::SocketAddr::from(([0, 0, 0, 0], DEFAULT_SIGNALING_PORT));
        let signaling_server = Arc::new(SignalingServer::new(signaling_addr));
        let signaling_client = Arc::new(RwLock::new(None));
        let is_view_only = Arc::new(AtomicBool::new(false));
        let active_tab_session_id = Arc::new(RwLock::new(None));

        Ok(Self {
            identity,
            storage,
            discovery,
            host_server,
            web_viewer,
            signaling_server,
            signaling_client,
            active_client_session: Arc::new(RwLock::new(None)),
            allow_remote_control,
            allow_lan_discovery,
            is_view_only,
            active_tab_session_id,
        })
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
        self.allow_remote_control
            .store(settings.allow_remote_control, Ordering::SeqCst);
        self.allow_lan_discovery
            .store(settings.enable_lan_discovery, Ordering::SeqCst);
        self.storage.save_settings(settings)
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
    pub async fn save_app_settings(
        state: State<'_, AppState>,
        settings: AppSettings,
    ) -> std::result::Result<(), String> {
        state
            .discovery
            .update_device_name(&settings.device_name)
            .await;
        state.save_settings(&settings).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn cmd_save_app_settings(
        state: State<'_, AppState>,
        settings: AppSettings,
    ) -> std::result::Result<(), String> {
        save_app_settings(state, settings).await
    }

    // --- Milestone 2: LAN Discovery & Host Credentials ---

    #[tauri::command]
    pub async fn get_lan_devices(
        state: State<'_, AppState>,
    ) -> std::result::Result<Vec<DiscoveredNode>, String> {
        Ok(state.discovery.get_discovered_nodes().await)
    }

    #[tauri::command]
    pub async fn cmd_get_lan_devices(
        state: State<'_, AppState>,
    ) -> std::result::Result<Vec<DiscoveredNode>, String> {
        get_lan_devices(state).await
    }

    #[tauri::command]
    pub async fn scan_lan_devices(
        state: State<'_, AppState>,
    ) -> std::result::Result<Vec<DiscoveredNode>, String> {
        Ok(state.discovery.scan_lan_subnet().await)
    }

    #[tauri::command]
    pub async fn cmd_scan_lan_devices(
        state: State<'_, AppState>,
    ) -> std::result::Result<Vec<DiscoveredNode>, String> {
        scan_lan_devices(state).await
    }

    #[tauri::command]
    pub async fn get_host_access_credentials(
        state: State<'_, AppState>,
    ) -> std::result::Result<HostAccessCredentials, String> {
        let dev_id = state.get_local_identity().device_id;
        let password = state.host_server.get_password().await;
        let settings = state.get_settings().unwrap_or_default();
        Ok(HostAccessCredentials {
            device_id: dev_id,
            access_password: password,
            listen_port: settings.local_listen_port,
            web_viewer_port: state.web_viewer.port(),
            local_ip: get_local_lan_ip(),
            allow_remote_control: state.allow_remote_control.load(Ordering::Relaxed),
            allow_lan_discovery: state.allow_lan_discovery.load(Ordering::Relaxed),
        })
    }

    #[tauri::command]
    pub async fn cmd_get_host_access_credentials(
        state: State<'_, AppState>,
    ) -> std::result::Result<HostAccessCredentials, String> {
        get_host_access_credentials(state).await
    }

    #[tauri::command]
    pub async fn generate_new_access_password(
        state: State<'_, AppState>,
    ) -> std::result::Result<String, String> {
        let new_pw = format!("{:06}", (rand::random::<u32>() % 900_000) + 100_000);
        state.host_server.update_password(&new_pw).await;
        Ok(new_pw)
    }

    #[tauri::command]
    pub async fn cmd_generate_new_access_password(
        state: State<'_, AppState>,
    ) -> std::result::Result<String, String> {
        generate_new_access_password(state).await
    }

    // --- Milestone 3: Real Remote Desktop Session & Input ---

    #[tauri::command]
    pub async fn connect_lan_session(
        app_handle: AppHandle,
        state: State<'_, AppState>,
        target_device_id: String,
        target_name: String,
        target_address: String,
        password: String,
    ) -> std::result::Result<SessionInfo, String> {
        let my_id = state.get_local_identity().device_id;
        let client_session = session::connect_to_remote_host(
            app_handle,
            &target_address,
            &target_device_id,
            &target_name,
            &my_id,
            &password,
        )
        .await
        .map_err(|e| e.to_string())?;

        let mut session_info =
            SessionInfo::new(&target_device_id, &target_name, ConnectionType::Lan, false);
        session_info.session_id = client_session.session_id.clone();
        session_info.state = SessionState::Connected;

        let mut guard = state.active_client_session.write().await;
        *guard = Some(client_session);

        Ok(session_info)
    }

    #[tauri::command]
    pub async fn cmd_connect_lan_session(
        app_handle: AppHandle,
        state: State<'_, AppState>,
        target_device_id: String,
        target_name: String,
        target_address: String,
        password: String,
    ) -> std::result::Result<SessionInfo, String> {
        connect_lan_session(
            app_handle,
            state,
            target_device_id,
            target_name,
            target_address,
            password,
        )
        .await
    }

    #[tauri::command]
    pub async fn connect_internet_session(
        app_handle: AppHandle,
        state: State<'_, AppState>,
        target_device_id: String,
        target_name: String,
        target_address: String,
        password: String,
    ) -> std::result::Result<SessionInfo, String> {
        let my_id = state.get_local_identity().device_id;

        let client_session = session::connect_to_remote_host(
            app_handle,
            &target_address,
            &target_device_id,
            &target_name,
            &my_id,
            &password,
        )
        .await
        .map_err(|e| format!("Internet remote connection failed: {e}"))?;

        let mut session_info = SessionInfo::new(
            &target_device_id,
            &target_name,
            ConnectionType::InternetRelay,
            false,
        );
        session_info.session_id = client_session.session_id.clone();
        session_info.state = SessionState::Connected;

        let mut guard = state.active_client_session.write().await;
        *guard = Some(client_session);

        Ok(session_info)
    }

    #[tauri::command]
    pub async fn cmd_connect_internet_session(
        app_handle: AppHandle,
        state: State<'_, AppState>,
        target_device_id: String,
        target_name: String,
        target_address: String,
        password: String,
    ) -> std::result::Result<SessionInfo, String> {
        connect_internet_session(
            app_handle,
            state,
            target_device_id,
            target_name,
            target_address,
            password,
        )
        .await
    }

    #[tauri::command]
    pub async fn send_session_input(
        state: State<'_, AppState>,
        input: InputKind,
    ) -> std::result::Result<(), String> {
        let guard = state.active_client_session.read().await;
        if let Some(session) = &*guard {
            session.send_input(input).await.map_err(|e| e.to_string())
        } else {
            Err("No active remote desktop session".into())
        }
    }

    #[tauri::command]
    pub async fn cmd_send_session_input(
        state: State<'_, AppState>,
        input: InputKind,
    ) -> std::result::Result<(), String> {
        send_session_input(state, input).await
    }

    #[tauri::command]
    pub async fn disconnect_session(state: State<'_, AppState>) -> std::result::Result<(), String> {
        let mut guard = state.active_client_session.write().await;
        if let Some(mut session) = guard.take() {
            session.disconnect();
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn cmd_disconnect_session(
        state: State<'_, AppState>,
    ) -> std::result::Result<(), String> {
        disconnect_session(state).await
    }

    // --- Milestone 5: Clipboard Sync, Permissions, Multi-Session Tab Isolation ---

    #[tauri::command]
    pub async fn sync_clipboard(
        state: State<'_, AppState>,
        text: String,
    ) -> std::result::Result<(), String> {
        let guard = state.active_client_session.read().await;
        if let Some(session) = &*guard {
            session
                .sync_clipboard(&text)
                .await
                .map_err(|e| e.to_string())
        } else {
            Err("No active remote desktop session to sync clipboard".into())
        }
    }

    #[tauri::command]
    pub async fn cmd_sync_clipboard(
        state: State<'_, AppState>,
        text: String,
    ) -> std::result::Result<(), String> {
        sync_clipboard(state, text).await
    }

    #[tauri::command]
    pub async fn set_session_permission(
        state: State<'_, AppState>,
        allow_input: bool,
    ) -> std::result::Result<(), String> {
        state.is_view_only.store(!allow_input, Ordering::SeqCst);
        let guard = state.active_client_session.read().await;
        if let Some(session) = &*guard {
            session.set_view_only(!allow_input);
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn cmd_set_session_permission(
        state: State<'_, AppState>,
        allow_input: bool,
    ) -> std::result::Result<(), String> {
        set_session_permission(state, allow_input).await
    }

    #[tauri::command]
    pub async fn set_active_session_tab(
        state: State<'_, AppState>,
        session_id: String,
    ) -> std::result::Result<(), String> {
        let mut tab_guard = state.active_tab_session_id.write().await;
        *tab_guard = Some(session_id.clone());
        let session_guard = state.active_client_session.read().await;
        if let Some(session) = &*session_guard {
            session.set_active_tab(session.session_id == session_id);
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn cmd_set_active_session_tab(
        state: State<'_, AppState>,
        session_id: String,
    ) -> std::result::Result<(), String> {
        set_active_session_tab(state, session_id).await
    }

    #[tauri::command]
    pub async fn kill_all_sessions(state: State<'_, AppState>) -> std::result::Result<(), String> {
        let mut guard = state.active_client_session.write().await;
        if let Some(mut session) = guard.take() {
            session.disconnect();
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn cmd_kill_all_sessions(
        state: State<'_, AppState>,
    ) -> std::result::Result<(), String> {
        kill_all_sessions(state).await
    }

    // --- Milestone 4: Internet Signaling & NAT Traversal ---

    #[tauri::command]
    pub async fn get_signaling_status(
        state: State<'_, AppState>,
    ) -> std::result::Result<SignalingStatusInfo, String> {
        let is_server_running = state.signaling_server.is_running();
        let count = state.signaling_server.registered_peer_count().await;
        let client_guard = state.signaling_client.read().await;
        let is_client_connected = client_guard
            .as_ref()
            .map(|c| c.is_connected())
            .unwrap_or(false);

        Ok(SignalingStatusInfo {
            is_server_running,
            is_client_connected,
            server_addr: format!("ws://127.0.0.1:{DEFAULT_SIGNALING_PORT}"),
            online_peers_count: count,
        })
    }

    #[tauri::command]
    pub async fn cmd_get_signaling_status(
        state: State<'_, AppState>,
    ) -> std::result::Result<SignalingStatusInfo, String> {
        get_signaling_status(state).await
    }

    #[tauri::command]
    pub async fn connect_signaling(
        app_handle: AppHandle,
        state: State<'_, AppState>,
        url: String,
    ) -> std::result::Result<(), String> {
        let identity = state.get_local_identity();
        let client = SignalingClient::connect(
            &url,
            &identity.device_id,
            "Workstation",
            &identity.public_key_b64,
        )
        .await
        .map_err(|e| e.to_string())?;

        let mut sub = client.subscribe();
        let app = app_handle.clone();
        tokio::spawn(async move {
            while let Ok(msg) = sub.recv().await {
                let _ = app.emit("signaling-event", msg);
            }
        });

        let mut guard = state.signaling_client.write().await;
        *guard = Some(client);
        Ok(())
    }

    #[tauri::command]
    pub async fn cmd_connect_signaling(
        app_handle: AppHandle,
        state: State<'_, AppState>,
        url: String,
    ) -> std::result::Result<(), String> {
        connect_signaling(app_handle, state, url).await
    }

    #[tauri::command]
    pub async fn cmd_disconnect_host_session(
        state: State<'_, AppState>,
        session_id: String,
    ) -> std::result::Result<bool, String> {
        Ok(state.host_server.disconnect_session(&session_id).await)
    }

    #[tauri::command]
    pub async fn disconnect_host_session(
        state: State<'_, AppState>,
        session_id: String,
    ) -> std::result::Result<bool, String> {
        cmd_disconnect_host_session(state, session_id).await
    }

    #[tauri::command]
    pub async fn cmd_open_firewall_settings() -> std::result::Result<(), String> {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("control.exe")
                .arg("firewall.cpl")
                .spawn();
        }
        Ok(())
    }

    #[tauri::command]
    pub async fn open_firewall_settings() -> std::result::Result<(), String> {
        cmd_open_firewall_settings().await
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

    // Auto-start background discovery, host server, HTML5 web viewer, and signaling
    let discovery = Arc::clone(&app_state.discovery);
    let allow_discovery = Arc::clone(&app_state.allow_lan_discovery);
    let host_server = Arc::clone(&app_state.host_server);
    let web_viewer = Arc::clone(&app_state.web_viewer);
    let signaling_server = Arc::clone(&app_state.signaling_server);

    tauri::async_runtime::spawn(async move {
        if let Err(e) = discovery.start(allow_discovery).await {
            log::warn!("Could not start LAN discovery service: {e}");
        }
    });

    let discovery_for_scan = Arc::clone(&app_state.discovery);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
        let _ = discovery_for_scan.scan_lan_subnet().await;
    });

    tauri::async_runtime::spawn(async move {
        if let Err(e) = host_server.start().await {
            log::warn!("Could not start TCP host server: {e}");
        }
    });

    tauri::async_runtime::spawn(async move {
        if let Err(e) = web_viewer.start().await {
            log::warn!("Could not start HTML5 Web Viewer server: {e}");
        }
    });

    tauri::async_runtime::spawn(async move {
        if let Err(e) = signaling_server.run().await {
            log::warn!("Signaling server stopped: {e}");
        }
    });

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let state: State<'_, AppState> = app.state();
            let host = Arc::clone(&state.host_server);
            let web = Arc::clone(&state.web_viewer);
            let h1 = handle.clone();
            tauri::async_runtime::spawn(async move {
                host.set_app_handle(h1).await;
            });
            tauri::async_runtime::spawn(async move {
                web.set_app_handle(handle).await;
            });
            Ok(())
        })
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
            commands::cmd_save_app_settings,
            commands::get_lan_devices,
            commands::cmd_get_lan_devices,
            commands::scan_lan_devices,
            commands::cmd_scan_lan_devices,
            commands::get_host_access_credentials,
            commands::cmd_get_host_access_credentials,
            commands::generate_new_access_password,
            commands::cmd_generate_new_access_password,
            commands::connect_lan_session,
            commands::cmd_connect_lan_session,
            commands::connect_internet_session,
            commands::cmd_connect_internet_session,
            commands::send_session_input,
            commands::cmd_send_session_input,
            commands::disconnect_session,
            commands::cmd_disconnect_session,
            commands::disconnect_host_session,
            commands::cmd_disconnect_host_session,
            commands::open_firewall_settings,
            commands::cmd_open_firewall_settings,
            commands::sync_clipboard,
            commands::cmd_sync_clipboard,
            commands::set_session_permission,
            commands::cmd_set_session_permission,
            commands::set_active_session_tab,
            commands::cmd_set_active_session_tab,
            commands::kill_all_sessions,
            commands::cmd_kill_all_sessions,
            commands::get_signaling_status,
            commands::cmd_get_signaling_status,
            commands::connect_signaling,
            commands::cmd_connect_signaling,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
