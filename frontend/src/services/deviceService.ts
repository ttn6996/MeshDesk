import { invoke } from '@tauri-apps/api/core';
import { AppSettings, Device, LocalIdentity, SessionInfo } from '../types';

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

// Seed devices start strictly as offline/unconnected until verified by live discovery
const INITIAL_SEED_DEVICES: Device[] = [
  {
    id: 'MD-1082-9402',
    name: 'Build-Server-Alpha',
    hostname: '192.168.1.150',
    status: 'offline',
    os_info: 'Windows 11 Pro x64',
    last_seen: new Date().toISOString(),
    tags: ['infra', 'builds'],
    notes: 'CI/CD pipeline workstation (LAN Direct)',
    latency_ms: undefined,
    is_favorite: true,
  },
  {
    id: 'MD-8321-4921',
    name: 'Design-Station-02',
    hostname: '192.168.1.182',
    status: 'offline',
    os_info: 'Windows 11 Pro x64',
    last_seen: new Date().toISOString(),
    tags: ['workstation', 'gpu'],
    notes: 'Rendering rig (LAN Direct)',
    latency_ms: undefined,
    is_favorite: true,
  },
  {
    id: 'MD-7419-5820',
    name: 'Lab-Test-Rig',
    hostname: '192.168.1.204',
    status: 'offline',
    os_info: 'Windows 10 Enterprise x64',
    last_seen: new Date(Date.now() - 3600000).toISOString(),
    tags: ['lab', 'testing'],
    notes: 'Regression test bench (LAN Direct)',
    latency_ms: undefined,
    is_favorite: false,
  },
  {
    id: 'MD-6204-1849',
    name: 'Office-Laptop-X1',
    hostname: undefined,
    status: 'offline',
    os_info: 'Windows 11 x64',
    last_seen: new Date(Date.now() - 86400000).toISOString(),
    tags: ['mobile'],
    notes: 'Mobile client (Internet P2P mode)',
    latency_ms: undefined,
    is_favorite: false,
  },
];

export interface IDeviceService {
  isTauriEnvironment(): boolean;
  getLocalIdentity(): Promise<LocalIdentity>;
  getDevices(): Promise<Device[]>;
  saveDevice(device: Device): Promise<void>;
  deleteDevice(id: string): Promise<boolean>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  simulateConnect(
    targetDeviceId: string,
    targetName: string,
    password: string,
    onStateChange: (state: SessionInfo) => void
  ): Promise<SessionInfo>;
  disconnectSession(sessionId: string): Promise<void>;
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
      device_id: 'MD-5920-1492',
      public_key: 'ed25519-c09a8f219b4e7a32fd810e7492c0192a8b9f',
      hostname: 'DESKTOP-STANDALONE',
      os_info: 'Windows 11 Pro x64 (Standalone Dev Mode)',
    };
    localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(newIdentity));
    return newIdentity;
  }

  async getDevices(): Promise<Device[]> {
    if (this.isTauriEnvironment()) {
      try {
        const devices = await invoke<Device[]>('cmd_list_devices');
        if (devices && devices.length > 0) {
          return devices;
        }
        // If first launch with empty database, seed initial devices
        for (const seed of INITIAL_SEED_DEVICES) {
          await invoke('cmd_save_device', { device: seed });
        }
        return await invoke<Device[]>('cmd_list_devices');
      } catch (err) {
        console.warn('Tauri IPC failed for list_devices, falling back to local store:', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY_DEVICES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(INITIAL_SEED_DEVICES));
      return INITIAL_SEED_DEVICES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_SEED_DEVICES;
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

  async simulateConnect(
    targetDeviceId: string,
    targetName: string,
    _password: string,
    onStateChange: (state: SessionInfo) => void
  ): Promise<SessionInfo> {
    const sessionId = `sim-sess-${Date.now()}`;
    const initialSession: SessionInfo = {
      session_id: sessionId,
      target_device_id: targetDeviceId,
      target_device_name: targetName,
      connection_type: 'lan',
      state: 'resolving',
      started_at: new Date().toISOString(),
      bytes_received: 0,
      bytes_sent: 0,
      is_simulated: true,
    };

    onStateChange(initialSession);

    // Realistic state progression for UI testing
    await new Promise((r) => setTimeout(r, 600));
    const step2: SessionInfo = {
      ...initialSession,
      state: 'connecting',
      bytes_sent: 256,
      bytes_received: 512,
    };
    onStateChange(step2);

    await new Promise((r) => setTimeout(r, 700));
    const step3: SessionInfo = {
      ...step2,
      state: 'authenticating',
      bytes_sent: 1024,
      bytes_received: 2048,
    };
    onStateChange(step3);

    await new Promise((r) => setTimeout(r, 600));
    const connectedSession: SessionInfo = {
      ...step3,
      state: 'connected',
      latency_ms: undefined, // Do not report fake latency as real network metrics
      fps: undefined,
      bytes_sent: 1024,
      bytes_received: 2048,
    };
    onStateChange(connectedSession);

    return connectedSession;
  }

  async disconnectSession(_sessionId: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
  }
}

export const deviceService: IDeviceService = new HybridDeviceService();
