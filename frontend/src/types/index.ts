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
