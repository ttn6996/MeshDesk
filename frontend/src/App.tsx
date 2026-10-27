import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { WorkspaceView } from './components/workspace/WorkspaceView';
import { SessionView } from './components/workspace/SessionView';
import { ConnectDialog } from './components/dialogs/ConnectDialog';
import { DeviceEditDialog } from './components/dialogs/DeviceEditDialog';
import { SettingsView } from './components/settings/SettingsView';
import { Device, LocalIdentity, SessionInfo, ConnectionMode } from './types';
import { deviceService } from './services/deviceService';

export const App: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [localIdentity, setLocalIdentity] = useState<LocalIdentity | null>(null);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentView, setCurrentView] = useState<'workspace' | 'settings'>('workspace');

  // Dialog states
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectTargetDevice, setConnectTargetDevice] = useState<Device | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  // Initialize data on mount & start real LAN discovery sync
  useEffect(() => {
    deviceService.getDevices().then(setDevices);
    deviceService.getLocalIdentity().then(setLocalIdentity);

    // Sync live LAN discovery nodes every 3 seconds
    const interval = setInterval(async () => {
      try {
        const lanNodes = await deviceService.getLanDevices();
        if (lanNodes && lanNodes.length > 0) {
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
                  os_info: node.os_info || 'Windows PC',
                  last_seen: lastSeenIso,
                  tags: ['lan-live'],
                  notes: `Auto-discovered on LAN (${nodeAddr})`,
                  latency_ms: node.latency_ms ?? 1,
                  is_favorite: false,
                });
              }
            }
            return updated;
          });
        }
      } catch (err) {
        console.warn('LAN discovery poll error:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Handle device connect (from card or dialog)
  const handleInitiateConnect = (device: Device) => {
    setConnectTargetDevice(device);
    setIsConnectOpen(true);
  };

  const handleExecuteConnect = async (
    deviceId: string,
    password: string,
    _mode: ConnectionMode
  ) => {
    setIsConnectOpen(false);

    // Look up target or generate placeholder
    const existing = devices.find((d) => d.id === deviceId);
    const targetName = existing ? existing.name : `Host-${deviceId.slice(3, 7)}`;
    const targetAddress = existing?.hostname || '127.0.0.1:48120';

    try {
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
    </div>
  );
};

export default App;
