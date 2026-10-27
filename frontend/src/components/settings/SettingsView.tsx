import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Save,
  Shield,
  Wifi,
  Database,
  Key,
  RotateCcw,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import { AppSettings, LocalIdentity, SignalingStatusInfo } from '../../types';
import { deviceService } from '../../services/deviceService';

interface SettingsViewProps {
  onBack: () => void;
  localIdentity: LocalIdentity | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack, localIdentity }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [signalingStatus, setSignalingStatus] = useState<SignalingStatusInfo | null>(null);
  const [isTestingSignaling, setIsTestingSignaling] = useState(false);

  useEffect(() => {
    deviceService.getSettings().then(setSettings);
    deviceService.getSignalingStatus().then(setSignalingStatus);
  }, []);

  if (!settings) return null;

  const handleTestSignaling = async () => {
    setIsTestingSignaling(true);
    try {
      if (settings.signaling_url) {
        await deviceService.connectSignaling(settings.signaling_url);
        const st = await deviceService.getSignalingStatus();
        setSignalingStatus(st);
      }
    } finally {
      setIsTestingSignaling(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await deviceService.saveSettings(settings);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleResetDatabase = async () => {
    if (confirm('Are you sure you want to clear local cache and reset settings?')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Application Settings</h1>
            <p className="text-xs text-slate-400">
              Configure network binding, security, and workspace preferences
            </p>
          </div>
        </div>

        {savedNotice && (
          <span className="flex items-center text-xs text-emerald-400 font-medium bg-emerald-950/80 px-3 py-1.5 rounded-lg border border-emerald-800/60 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            Settings saved successfully
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Local Device Identity */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
            <Key className="w-4 h-4 text-blue-400" />
            <span>Cryptographic Node Identity</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Assigned Device ID</label>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-200 font-semibold">
                {localIdentity?.device_id || 'Generating...'}
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Host Platform</label>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-400 truncate">
                {localIdentity?.os_info || 'Windows 11 x64'}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-400 font-medium mb-1">
                Ed25519 Public Key Digest
              </label>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-slate-500 text-[11px] break-all">
                {localIdentity?.public_key || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Security & Remote Access Consent */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Security & Remote Access Consent</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Allow Remote Control Sessions
                </span>
                <span className="text-[11px] text-slate-400">
                  Allow authorized controllers with temporary access passwords to view and interact
                  with this computer
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.allow_remote_control}
                onChange={(e) =>
                  setSettings({ ...settings, allow_remote_control: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 rounded bg-slate-900 border-slate-700 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Session Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="480"
                  value={settings.session_timeout_minutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      session_timeout_minutes: parseInt(e.target.value) || 60,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Device Display Name
                </label>
                <input
                  type="text"
                  value={settings.device_name}
                  onChange={(e) => setSettings({ ...settings, device_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Networking & Discovery */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
            <Wifi className="w-4 h-4 text-blue-400" />
            <span>Networking & LAN Discovery</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/70 border border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Enable Local Network (LAN) Discovery
                </span>
                <span className="text-[11px] text-slate-400">
                  Broadcast presence via UDP to allow computers on the same subnet to discover this
                  PC automatically
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.enable_lan_discovery}
                onChange={(e) =>
                  setSettings({ ...settings, enable_lan_discovery: e.target.checked })
                }
                className="w-4 h-4 text-blue-600 rounded bg-slate-900 border-slate-700 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  LAN Discovery Port (UDP)
                </label>
                <input
                  type="number"
                  value={settings.lan_discovery_port}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      lan_discovery_port: parseInt(e.target.value) || 48121,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Direct LAN Listen Port (TCP)
                </label>
                <input
                  type="number"
                  value={settings.local_listen_port}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      local_listen_port: parseInt(e.target.value) || 48120,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Signaling WebSocket Broker (Milestone 4)
                  </label>
                  {signalingStatus && (
                    <span className="flex items-center text-[10px] text-slate-400 font-mono">
                      <Radio className="w-3 h-3 text-emerald-400 mr-1 animate-pulse" />
                      Broker Status: {signalingStatus.is_server_running ? 'Listening' : 'Ready'}
                    </span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={settings.signaling_url}
                    onChange={(e) => setSettings({ ...settings, signaling_url: e.target.value })}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleTestSignaling}
                    disabled={isTestingSignaling}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
                  >
                    {isTestingSignaling ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  STUN ICE Server URL
                </label>
                <input
                  type="text"
                  value={settings.stun_server}
                  onChange={(e) => setSettings({ ...settings, stun_server: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Storage & Maintenance */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-200">Reset Local Configuration</h4>
              <p className="text-[11px] text-slate-400">
                Clear cached local settings and reload workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetDatabase}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-950/60 text-rose-300 border border-rose-800/50 text-xs font-medium transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset Cache</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center space-x-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/20 transition active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
