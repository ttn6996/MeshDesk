export type DeviceStatus = 'online' | 'offline' | 'busy' | 'connecting';

export type ConnectionMode = 'auto' | 'lan_only' | 'internet_only';

export type ConnectionType = 'lan' | 'internet_p2p' | 'internet_relay';

export type SessionState =
  | 'resolving'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'terminated';

export interface Device {
  id: string; // e.g. "MD-8192-3021"
  name: string;
  hostname?: string;
  status: DeviceStatus;
  os_info: string;
  last_seen: string;
  tags: string[];
  notes?: string;
  latency_ms?: number;
  is_favorite: boolean;
}

export interface SessionInfo {
  session_id: string;
  target_device_id: string;
  target_device_name: string;
  connection_type: ConnectionType;
  state: SessionState;
  started_at: string;
  latency_ms?: number;
  fps?: number;
  bytes_received: number;
  bytes_sent: number;
  is_simulated: boolean;
  error_message?: string;
  allow_input?: boolean;
}

export interface LocalIdentity {
  device_id: string;
  public_key: string;
  hostname: string;
  os_info: string;
}

export interface AppSettings {
  device_name: string;
  allow_remote_control: boolean;
  enable_lan_discovery: boolean;
  lan_discovery_port: number;
  local_listen_port: number;
  signaling_url: string;
  stun_server: string;
  session_timeout_minutes: number;
  theme: 'dark' | 'light';
}

export interface DiscoveredNode {
  device_id: string;
  hostname?: string;
  device_name?: string;
  ip?: string;
  ip_address?: string;
  port?: number;
  listen_port?: number;
  os_info: string;
  status?: string;
  last_seen?: string;
  last_seen_epoch_ms?: number;
  last_seen_epoch_secs?: number;
  latency_ms?: number;
}

export interface HostAccessCredentials {
  device_id: string;
  access_password: string;
  listen_port?: number;
  port?: number;
  web_viewer_port?: number;
  local_ip?: string;
  allow_remote_control?: boolean;
  allow_lan_discovery?: boolean;
  is_accepting_connections?: boolean;
}

export interface SessionFrameEvent {
  session_id: string;
  seq: number;
  width: number;
  height: number;
  format: string;
  data_b64: string;
}

export type InputKind =
  | { MouseMove: { x: number; y: number } }
  | { MouseDown: { button: number } }
  | { MouseUp: { button: number } }
  | { MouseWheel: { delta_y: number } }
  | { KeyDown: { key_code: number } }
  | { KeyUp: { key_code: number } };

export interface SignalingStatusInfo {
  is_server_running: boolean;
  is_client_connected: boolean;
  server_addr: string;
  online_peers_count: number;
}

export interface HostIncomingSessionEvent {
  session_id: string;
  client_device_id: string;
  client_ip: string;
  granted_permissions: string[];
}

export interface HostSessionDisconnectedEvent {
  session_id: string;
  client_device_id: string;
  reason: string;
}


