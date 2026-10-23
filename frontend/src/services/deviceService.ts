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

const INITIAL_DEVICES: Device[] = [
  {
    id: 'MD-1082-9402',
    name: 'Build-Server-Alpha',
    hostname: '192.168.1.150',
    status: 'online',
    os_info: 'Windows 11 Pro x64',
    last_seen: new Date().toISOString(),
    tags: ['infra', 'builds'],
    notes: 'CI/CD pipeline host with 32-core Threadripper',
    latency_ms: 12,
    is_favorite: true,
  },
  {
    id: 'MD-8321-4921',
    name: 'Design-Station-02',
    hostname: '192.168.1.182',
    status: 'online',
    os_info: 'Windows 11 Pro x64',
    last_seen: new Date().toISOString(),
    tags: ['workstation', 'gpu'],
    notes: 'Dual RTX 4090 Rendering Rig',
    latency_ms: 19,
    is_favorite: true,
  },
  {
    id: 'MD-7419-5820',
    name: 'Lab-Test-Rig',
    hostname: '192.168.1.204',
    status: 'busy',
    os_info: 'Windows 10 Enterprise x64',
    last_seen: new Date(Date.now() - 3600000).toISOString(),
    tags: ['lab', 'testing'],
    notes: 'Automated hardware regression test bench',
    latency_ms: 28,
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
    notes: 'Roaming laptop, connects via Internet P2P',
    latency_ms: undefined,
    is_favorite: false,
  },
];

export interface IDeviceService {
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

class LocalStorageDeviceService implements IDeviceService {
  async getLocalIdentity(): Promise<LocalIdentity> {
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
      hostname: 'DESKTOP-LOCAL',
      os_info: 'Windows 11 Pro x64 (Build 26100)',
    };
    localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(newIdentity));
    return newIdentity;
  }

  async getDevices(): Promise<Device[]> {
    const raw = localStorage.getItem(STORAGE_KEY_DEVICES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(INITIAL_DEVICES));
      return INITIAL_DEVICES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_DEVICES;
    }
  }

  async saveDevice(device: Device): Promise<void> {
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
    const devices = await this.getDevices();
    const filtered = devices.filter((d) => d.id !== id);
    localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(filtered));
    return filtered.length < devices.length;
  }

  async getSettings(): Promise<AppSettings> {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
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

    // Realistic state machine progression
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
      latency_ms: Math.floor(Math.random() * 15) + 12,
      fps: 60,
      bytes_sent: 16384,
      bytes_received: 148590,
    };
    onStateChange(connectedSession);

    return connectedSession;
  }

  async disconnectSession(_sessionId: string): Promise<void> {
    // Simulated teardown
    await new Promise((r) => setTimeout(r, 200));
  }
}

export const deviceService: IDeviceService = new LocalStorageDeviceService();
