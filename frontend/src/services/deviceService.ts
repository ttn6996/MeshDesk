import { invoke } from '@tauri-apps/api/core';
import {
  AppSettings,
  Device,
  DiscoveredNode,
  HostAccessCredentials,
  InputKind,
  LocalIdentity,
  SessionInfo,
  SignalingStatusInfo,
} from '../types';

const STORAGE_KEY_DEVICES = 'meshdesk_persistent_devices_v1';
const STORAGE_KEY_SETTINGS = 'meshdesk_persistent_settings_v1';
const STORAGE_KEY_IDENTITY = 'meshdesk_local_identity_v1';

const DEFAULT_SETTINGS: AppSettings = {
  device_name: 'Workstation-Host',
  allow_remote_control: true,
  enable_lan_discovery: true,
  lan_discovery_port: 48121,
  local_listen_port: 48120,
  signaling_url: 'ws://127.0.0.1:48122/ws',
  stun_server: 'stun:stun.l.google.com:19302',
  session_timeout_minutes: 60,
  theme: 'dark',
};

export interface IDeviceService {
  isTauriEnvironment(): boolean;
  getLocalIdentity(): Promise<LocalIdentity>;
  getDevices(): Promise<Device[]>;
  saveDevice(device: Device): Promise<void>;
  deleteDevice(id: string): Promise<boolean>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  getLanDevices(): Promise<DiscoveredNode[]>;
  scanLanDevices(): Promise<DiscoveredNode[]>;
  getHostAccessCredentials(): Promise<HostAccessCredentials>;
  generateNewAccessPassword(): Promise<HostAccessCredentials>;
  connectLanSession(
    targetDeviceId: string,
    targetName: string,
    targetAddress: string,
    password: string,
    onStateChange?: (state: SessionInfo) => void
  ): Promise<SessionInfo>;
  connectInternetSession(
    targetDeviceId: string,
    targetName: string,
    targetAddress: string,
    password: string,
    onStateChange?: (state: SessionInfo) => void
  ): Promise<SessionInfo>;
  sendSessionInput(input: InputKind): Promise<void>;
  disconnectSession(sessionId?: string): Promise<void>;
  syncClipboard(text: string): Promise<void>;
  setSessionPermission(allowInput: boolean): Promise<void>;
  setActiveSessionTab(sessionId: string): Promise<void>;
  killAllSessions(): Promise<void>;
  getSignalingStatus(): Promise<SignalingStatusInfo>;
  connectSignaling(url: string): Promise<void>;
  disconnectHostSession(sessionId: string): Promise<boolean>;
  openFirewallSettings(): Promise<void>;
}

function checkIsTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

class HybridDeviceService implements IDeviceService {
  isTauriEnvironment(): boolean {
    return checkIsTauri();
  }

  async getLocalIdentity(): Promise<LocalIdentity> {
    if (this.isTauriEnvironment()) {
      try {
        const raw = await invoke<{ device_id: string; public_key_b64: string }>(
          'cmd_get_local_identity'
        );
        return {
          device_id: raw.device_id,
          public_key: raw.public_key_b64,
          hostname: 'DESKTOP-WINDOWS',
          os_info: 'Windows 10/11 x64',
        };
      } catch (err) {
        console.warn('Tauri IPC failed for getLocalIdentity, falling back to local store:', err);
      }
    }

    const cached = localStorage.getItem(STORAGE_KEY_IDENTITY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback
      }
    }

    const newIdentity: LocalIdentity = {
      device_id: `MD-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      public_key: 'standalone-preview-key',
      hostname: 'DESKTOP-STANDALONE',
      os_info: 'Windows 10/11 x64',
    };
    localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(newIdentity));
    return newIdentity;
  }

  async getDevices(): Promise<Device[]> {
    const LEGACY_MOCK_IDS = new Set([
      'MD-1082-9402',
      'MD-8321-4921',
      'MD-7419-5820',
      'MD-6204-1849',
      'MD-8192-3021',
    ]);

    if (this.isTauriEnvironment()) {
      try {
        const devices = await invoke<Device[]>('cmd_list_devices');
        if (devices) {
          // Immediately purge any legacy mock devices if found
          const cleaned = devices.filter((d) => {
            if (LEGACY_MOCK_IDS.has(d.id)) {
              invoke('cmd_delete_device', { id: d.id }).catch(() => {});
              return false;
            }
            return true;
          });
          return cleaned;
        }
        return [];
      } catch (err) {
        console.warn('Tauri IPC failed for list_devices, falling back to local store:', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY_DEVICES);
    if (!raw) {
      return [];
    }
    try {
      const parsed: Device[] = JSON.parse(raw);
      const cleaned = parsed.filter((d) => !LEGACY_MOCK_IDS.has(d.id));
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(cleaned));
      }
      return cleaned;
    } catch {
      return [];
    }
  }

  async saveDevice(device: Device): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_save_device', { device });
        return;
      } catch (err) {
        console.warn('Tauri IPC failed for save_device, falling back to local store:', err);
      }
    }

    const devices = await this.getDevices();
    const existingIndex = devices.findIndex((d) => d.id === device.id);
    if (existingIndex >= 0) {
      devices[existingIndex] = device;
    } else {
      devices.unshift(device);
    }
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(devices));
  }

  async deleteDevice(id: string): Promise<boolean> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<boolean>('cmd_delete_device', { id });
      } catch (err) {
        console.warn('Tauri IPC failed for delete_device, falling back to local store:', err);
      }
    }

    const devices = await this.getDevices();
    const filtered = devices.filter((d) => d.id !== id);
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(filtered));
    return filtered.length < devices.length;
  }

  async getSettings(): Promise<AppSettings> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<AppSettings>('cmd_get_app_settings');
      } catch (err) {
        console.warn('Tauri IPC failed for get_settings, falling back to local store:', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_save_app_settings', { settings });
        return;
      } catch (err) {
        console.warn('Tauri IPC failed for save_settings, falling back to local store:', err);
      }
    }

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }

  async getLanDevices(): Promise<DiscoveredNode[]> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<DiscoveredNode[]>('cmd_get_lan_devices');
      } catch (err) {
        console.warn('Tauri IPC failed for get_lan_devices:', err);
      }
    }
    return [];
  }

  async scanLanDevices(): Promise<DiscoveredNode[]> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<DiscoveredNode[]>('cmd_scan_lan_devices');
      } catch (err) {
        console.warn('Tauri IPC failed for scan_lan_devices:', err);
      }
    }
    return this.getLanDevices();
  }

  async getHostAccessCredentials(): Promise<HostAccessCredentials> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<HostAccessCredentials>('cmd_get_host_access_credentials');
      } catch (err) {
        console.warn('Tauri IPC failed for get_host_access_credentials:', err);
      }
    }
    return {
      device_id: 'MD-OFFLINE',
      access_password: '',
      port: 48120,
      is_accepting_connections: false,
    };
  }

  async generateNewAccessPassword(): Promise<HostAccessCredentials> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<HostAccessCredentials>('cmd_generate_new_access_password');
      } catch (err) {
        console.warn('Tauri IPC failed for generate_new_access_password:', err);
      }
    }
    return this.getHostAccessCredentials();
  }

  async connectLanSession(
    targetDeviceId: string,
    targetName: string,
    targetAddress: string,
    password: string,
    onStateChange?: (state: SessionInfo) => void
  ): Promise<SessionInfo> {
    if (onStateChange) {
      onStateChange({
        session_id: `lan-init-${Date.now()}`,
        target_device_id: targetDeviceId,
        target_device_name: targetName,
        connection_type: 'lan',
        state: 'connecting',
        started_at: new Date().toISOString(),
        bytes_received: 0,
        bytes_sent: 0,
        is_simulated: false,
      });
    }

    if (this.isTauriEnvironment()) {
      try {
        const sessionInfo = await invoke<SessionInfo>('cmd_connect_lan_session', {
          targetDeviceId,
          targetName,
          targetAddress,
          password,
        });
        if (onStateChange) {
          onStateChange(sessionInfo);
        }
        return sessionInfo;
      } catch (err) {
        console.error('Tauri IPC connect_lan_session failed:', err);
        const errSession: SessionInfo = {
          session_id: `failed-${Date.now()}`,
          target_device_id: targetDeviceId,
          target_device_name: targetName,
          connection_type: 'lan',
          state: 'failed',
          started_at: new Date().toISOString(),
          bytes_received: 0,
          bytes_sent: 0,
          is_simulated: false,
          error_message: String(err),
        };
        if (onStateChange) {
          onStateChange(errSession);
        }
        throw err;
      }
    }

    const notSupportedErr: SessionInfo = {
      session_id: `failed-${Date.now()}`,
      target_device_id: targetDeviceId,
      target_device_name: targetName,
      connection_type: 'lan',
      state: 'failed',
      started_at: new Date().toISOString(),
      bytes_received: 0,
      bytes_sent: 0,
      is_simulated: false,
      error_message: 'Direct LAN connection requires MeshDesk Tauri runtime.',
    };
    if (onStateChange) {
      onStateChange(notSupportedErr);
    }
    throw new Error('Direct LAN connection requires MeshDesk Tauri runtime.');
  }

  async connectInternetSession(
    targetDeviceId: string,
    targetName: string,
    targetAddress: string,
    password: string,
    onStateChange?: (state: SessionInfo) => void
  ): Promise<SessionInfo> {
    if (onStateChange) {
      onStateChange({
        session_id: `wan-init-${Date.now()}`,
        target_device_id: targetDeviceId,
        target_device_name: targetName,
        connection_type: 'internet_relay',
        state: 'connecting',
        started_at: new Date().toISOString(),
        bytes_received: 0,
        bytes_sent: 0,
        is_simulated: false,
      });
    }

    if (this.isTauriEnvironment()) {
      try {
        const sessionInfo = await invoke<SessionInfo>('cmd_connect_internet_session', {
          targetDeviceId,
          targetName,
          targetAddress,
          password,
        });
        if (onStateChange) {
          onStateChange(sessionInfo);
        }
        return sessionInfo;
      } catch (err: any) {
        const errSession: SessionInfo = {
          session_id: `wan-err-${Date.now()}`,
          target_device_id: targetDeviceId,
          target_device_name: targetName,
          connection_type: 'internet_relay',
          state: 'failed',
          started_at: new Date().toISOString(),
          bytes_received: 0,
          bytes_sent: 0,
          is_simulated: false,
          error_message: String(err?.message || err),
        };
        if (onStateChange) {
          onStateChange(errSession);
        }
        throw err;
      }
    }

    const notSupportedErr: SessionInfo = {
      session_id: `failed-${Date.now()}`,
      target_device_id: targetDeviceId,
      target_device_name: targetName,
      connection_type: 'internet_relay',
      state: 'failed',
      started_at: new Date().toISOString(),
      bytes_received: 0,
      bytes_sent: 0,
      is_simulated: false,
      error_message: 'Internet connection requires MeshDesk Tauri runtime.',
    };
    if (onStateChange) {
      onStateChange(notSupportedErr);
    }
    throw new Error('Internet connection requires MeshDesk Tauri runtime.');
  }

  async sendSessionInput(input: InputKind): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_send_session_input', { input });
      } catch {
        // Ignored for high-frequency input
      }
    }
  }

  async disconnectSession(_sessionId?: string): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_disconnect_session');
      } catch (err) {
        console.warn('Tauri IPC disconnect_session failed:', err);
      }
    }
  }

  async syncClipboard(text: string): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_sync_clipboard', { text });
      } catch (err) {
        console.warn('Tauri IPC sync_clipboard failed:', err);
      }
    }
  }

  async setSessionPermission(allowInput: boolean): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_set_session_permission', { allowInput });
      } catch (err) {
        console.warn('Tauri IPC set_session_permission failed:', err);
      }
    }
  }

  async setActiveSessionTab(sessionId: string): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_set_active_session_tab', { sessionId });
      } catch (err) {
        console.warn('Tauri IPC set_active_session_tab failed:', err);
      }
    }
  }

  async killAllSessions(): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_kill_all_sessions');
      } catch (err) {
        console.warn('Tauri IPC kill_all_sessions failed:', err);
      }
    }
  }

  async getSignalingStatus(): Promise<SignalingStatusInfo> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<SignalingStatusInfo>('cmd_get_signaling_status');
      } catch (err) {
        console.warn('Tauri IPC get_signaling_status failed:', err);
      }
    }
    return {
      is_server_running: false,
      is_client_connected: false,
      server_addr: 'ws://127.0.0.1:48122',
      online_peers_count: 0,
    };
  }

  async connectSignaling(url: string): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_connect_signaling', { url });
      } catch (err) {
        console.warn('Tauri IPC connect_signaling failed:', err);
      }
    }
  }

  async disconnectHostSession(sessionId: string): Promise<boolean> {
    if (this.isTauriEnvironment()) {
      try {
        return await invoke<boolean>('cmd_disconnect_host_session', { sessionId });
      } catch (err) {
        console.warn('Tauri IPC disconnect_host_session failed:', err);
      }
    }
    return true;
  }

  async openFirewallSettings(): Promise<void> {
    if (this.isTauriEnvironment()) {
      try {
        await invoke('cmd_open_firewall_settings');
      } catch (err) {
        console.warn('Tauri IPC open_firewall_settings failed:', err);
      }
    }
  }
}

export const deviceService: IDeviceService = new HybridDeviceService();
