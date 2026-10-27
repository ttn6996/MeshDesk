import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Radio, PowerOff } from 'lucide-react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { WorkspaceView } from './components/workspace/WorkspaceView';
import { SessionView } from './components/workspace/SessionView';
import { ConnectDialog } from './components/dialogs/ConnectDialog';
import { DeviceEditDialog } from './components/dialogs/DeviceEditDialog';
import { SettingsView } from './components/settings/SettingsView';
import {
  Device,
  LocalIdentity,
  SessionInfo,
  ConnectionMode,
  DiscoveredNode,
  HostIncomingSessionEvent,
  HostSessionDisconnectedEvent,
} from './types';
import { deviceService } from './services/deviceService';

export const App: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [localIdentity, setLocalIdentity] = useState<LocalIdentity | null>(null);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [incomingHostSessions, setIncomingHostSessions] = useState<HostIncomingSessionEvent[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentView, setCurrentView] = useState<'workspace' | 'settings'>('workspace');

  // Dialog states
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectTargetDevice, setConnectTargetDevice] = useState<Device | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [isScanningLan, setIsScanningLan] = useState(false);

  const syncLanNodes = (lanNodes: DiscoveredNode[]) => {
    if (!lanNodes || lanNodes.length === 0) return;
    setDevices((prevDevices) => {
      const updated = [...prevDevices];
      for (const node of lanNodes) {
        const name =
          node.device_name || node.hostname || `Host-${node.device_id.slice(3, 7)}`;
        const ip = node.ip_address || node.ip || '127.0.0.1';
        const port = node.listen_port || node.port || 48120;
        const nodeAddr = `${ip}:${port}`;

        let lastSeenIso = new Date().toISOString();
        if (node.last_seen) {
          lastSeenIso = node.last_seen;
        } else if (typeof node.last_seen_epoch_secs === 'number') {
          lastSeenIso = new Date(node.last_seen_epoch_secs * 1000).toISOString();
        } else if (typeof node.last_seen_epoch_ms === 'number') {
          lastSeenIso = new Date(node.last_seen_epoch_ms).toISOString();
        }

        const idx = updated.findIndex((d) => d.id === node.device_id);
        if (idx >= 0) {
          updated[idx] = {
            ...updated[idx],
            name,
            status: 'online',
            hostname: nodeAddr,
            latency_ms: node.latency_ms ?? 1,
            last_seen: lastSeenIso,
          };
        } else {
          updated.push({
            id: node.device_id,
            name,
            hostname: nodeAddr,
            status: 'online',
            os_info: node.os_info || 'Wi-Fi / LAN Device',
            last_seen: lastSeenIso,
            tags: ['lan-device'],
            notes: `Discovered on local network (${nodeAddr})`,
            latency_ms: node.latency_ms ?? 1,
            is_favorite: false,
          });
        }
      }
      return updated;
    });
  };

  const handleScanLan = async () => {
    setIsScanningLan(true);
    try {
      const nodes = await deviceService.scanLanDevices();
      syncLanNodes(nodes);
    } catch (err) {
      console.warn('LAN subnet scan failed:', err);
    } finally {
      setIsScanningLan(false);
    }
  };

  // Initialize data on mount & start real LAN discovery sync
  useEffect(() => {
    deviceService.getDevices().then(setDevices);
    deviceService.getLocalIdentity().then(setLocalIdentity);

    // Initial background scan after 1.5s
    const scanTimer = setTimeout(() => {
      handleScanLan();
    }, 1500);

    // Sync live LAN discovery nodes every 3 seconds
    const interval = setInterval(async () => {
      try {
        const lanNodes = await deviceService.getLanDevices();
        syncLanNodes(lanNodes);
      } catch (err) {
        console.warn('LAN discovery poll error:', err);
      }
    }, 3000);

    // Listen for incoming controller connections to this host
    let unlistenHostConnect: (() => void) | null = null;
    let unlistenHostDisconnect: (() => void) | null = null;

    if (deviceService.isTauriEnvironment()) {
      listen<HostIncomingSessionEvent>('host-incoming-session', (event) => {
        const payload = event.payload;
        setIncomingHostSessions((prev) => {
          if (prev.some((s) => s.session_id === payload.session_id)) return prev;
          return [...prev, payload];
        });
      }).then((unlisten) => {
        unlistenHostConnect = unlisten;
      });

      listen<HostSessionDisconnectedEvent>('host-session-disconnected', (event) => {
        const payload = event.payload;
        setIncomingHostSessions((prev) =>
          prev.filter((s) => s.session_id !== payload.session_id)
        );
      }).then((unlisten) => {
        unlistenHostDisconnect = unlisten;
      });
    }

    return () => {
      clearTimeout(scanTimer);
      clearInterval(interval);
      if (unlistenHostConnect) unlistenHostConnect();
      if (unlistenHostDisconnect) unlistenHostDisconnect();
    };
  }, []);

  const handleDisconnectHostSession = async (sessionId: string) => {
    await deviceService.disconnectHostSession(sessionId);
    setIncomingHostSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
  };

  // 1-Click Direct Connect (similar to spacedesk)
  const handleInitiateConnect = (device: Device) => {
    handleExecuteConnect(device.id, '', 'auto');
  };

  const handleExecuteConnect = async (
    deviceId: string,
    password: string,
    mode: ConnectionMode
  ) => {
    setIsConnectOpen(false);

    // Look up target or handle direct IP input
    const existing = devices.find((d) => d.id === deviceId);
    const targetName = existing
      ? existing.name
      : deviceId.includes('.')
      ? `Host (${deviceId})`
      : `Host-${deviceId.slice(3, 7)}`;

    let targetAddress = existing?.hostname || '127.0.0.1:48120';
    if (!existing && deviceId.includes('.')) {
      targetAddress = deviceId.includes(':') ? deviceId : `${deviceId}:48120`;
    }

    try {
      if (mode === 'internet_only') {
        await deviceService.connectInternetSession(
          deviceId,
          targetName,
          targetAddress,
          password,
          (updatedSession) => {
            setActiveSessions((prev) => {
              const index = prev.findIndex((s) => s.session_id === updatedSession.session_id);
              if (index >= 0) {
                const next = [...prev];
                next[index] = updatedSession;
                return next;
              } else {
                return [...prev, updatedSession];
              }
            });
            setActiveSessionId(updatedSession.session_id);
          }
        );
      } else {
        await deviceService.connectLanSession(
          deviceId,
          targetName,
          targetAddress,
          password,
          (updatedSession) => {
            setActiveSessions((prev) => {
              const index = prev.findIndex((s) => s.session_id === updatedSession.session_id);
              if (index >= 0) {
                const next = [...prev];
                next[index] = updatedSession;
                return next;
              } else {
                return [...prev, updatedSession];
              }
            });
            setActiveSessionId(updatedSession.session_id);
          }
        );
      }
    } catch (err) {
      console.error('Connection attempt failed:', err);
    }
  };

  // Terminate specific session
  const handleCloseSession = async (sessionId: string) => {
    await deviceService.disconnectSession(sessionId);
    setActiveSessions((prev) => {
      const remaining = prev.filter((s) => s.session_id !== sessionId);
      if (sessionId === activeSessionId && remaining.length > 0) {
        setActiveSessionId(remaining[remaining.length - 1].session_id);
      }
      return remaining;
    });
  };

  // Terminate all sessions
  const handleDisconnectAll = async () => {
    await deviceService.killAllSessions();
    setActiveSessions([]);
    setActiveSessionId('');
  };

  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    await deviceService.setActiveSessionTab(sessionId);
  };

  // Save device (add or edit)
  const handleSaveDevice = async (device: Device) => {
    await deviceService.saveDevice(device);
    const updated = await deviceService.getDevices();
    setDevices(updated);
  };

  // Delete device
  const handleDeleteDevice = async (deviceId: string) => {
    if (confirm(`Remove workstation ${deviceId} from your saved workspace?`)) {
      await deviceService.deleteDevice(deviceId);
      const updated = await deviceService.getDevices();
      setDevices(updated);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = async (device: Device) => {
    const updated = { ...device, is_favorite: !device.is_favorite };
    await deviceService.saveDevice(updated);
    setDevices((prev) => prev.map((d) => (d.id === device.id ? updated : d)));
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Global Application Header */}
      <Header
        localIdentity={localIdentity}
        activeSessionsCount={activeSessions.length}
        onOpenConnectDialog={() => {
          setConnectTargetDevice(null);
          setIsConnectOpen(true);
        }}
        onOpenAddDeviceDialog={() => {
          setEditingDevice(null);
          setIsEditOpen(true);
        }}
        onOpenSettings={() => setCurrentView(currentView === 'settings' ? 'workspace' : 'settings')}
        onDisconnectAllSessions={handleDisconnectAll}
        onScanLan={handleScanLan}
        isScanningLan={isScanningLan}
      />

      {/* Main Layout Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          devices={devices}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            setCurrentView('workspace');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectDevice={handleInitiateConnect}
        />

        {/* Content View: Settings, Active Session Tabs, or Workspace Grid */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-925">
          {currentView === 'settings' ? (
            <SettingsView
              onBack={() => setCurrentView('workspace')}
              localIdentity={localIdentity}
            />
          ) : activeSessions.length > 0 ? (
            <SessionView
              sessions={activeSessions}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onCloseSession={handleCloseSession}
            />
          ) : (
            <WorkspaceView
              devices={devices}
              selectedCategory={selectedCategory}
              searchQuery={searchQuery}
              activeSessionsCount={activeSessions.length}
              onConnect={handleInitiateConnect}
              onEdit={(d) => {
                setEditingDevice(d);
                setIsEditOpen(true);
              }}
              onDelete={handleDeleteDevice}
              onToggleFavorite={handleToggleFavorite}
              onOpenAddDevice={() => {
                setEditingDevice(null);
                setIsEditOpen(true);
              }}
              onScanLan={handleScanLan}
              isScanningLan={isScanningLan}
              onOpenConnectDialog={() => setIsConnectOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Connect-by-ID Dialog */}
      <ConnectDialog
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
        onConnect={handleExecuteConnect}
        initialDevice={connectTargetDevice}
      />

      {/* Add / Edit Device Dialog */}
      <DeviceEditDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveDevice}
        device={editingDevice}
      />

      {/* Host Incoming Remote Session Live Overlay Banner */}
      {incomingHostSessions.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full animate-in slide-in-from-bottom-4 duration-300">
          {incomingHostSessions.map((session) => (
            <div
              key={session.session_id}
              className="bg-slate-900/95 border-2 border-emerald-500 rounded-xl p-4 shadow-2xl shadow-emerald-950/60 backdrop-blur-md flex items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center">
                    <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
                  </div>
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      Remote Session Active
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white truncate">
                    Controller: {session.client_device_id}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    IP: {session.client_ip} • Screen streaming active
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDisconnectHostSession(session.session_id)}
                className="flex-shrink-0 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-900/40 transition-all hover:scale-105"
                title="Disconnect controller session"
              >
                <PowerOff className="w-3.5 h-3.5" />
                Ngắt kết nối
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
