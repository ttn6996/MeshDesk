import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Plus,
  Radio,
  Settings,
  PowerOff,
  Copy,
  Check,
  Share2,
  Key,
  RefreshCw,
} from 'lucide-react';
import { HostAccessCredentials, LocalIdentity } from '../../types';
import { deviceService } from '../../services/deviceService';

interface HeaderProps {
  localIdentity: LocalIdentity | null;
  activeSessionsCount: number;
  onOpenConnectDialog: () => void;
  onOpenAddDeviceDialog: () => void;
  onOpenSettings: () => void;
  onDisconnectAllSessions: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  localIdentity,
  activeSessionsCount,
  onOpenConnectDialog,
  onOpenAddDeviceDialog,
  onOpenSettings,
  onDisconnectAllSessions,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  const [credentials, setCredentials] = useState<HostAccessCredentials | null>(null);
  const [isRefreshingPw, setIsRefreshingPw] = useState(false);

  useEffect(() => {
    deviceService.getHostAccessCredentials().then(setCredentials);
  }, []);

  const copyDeviceId = () => {
    if (!localIdentity) return;
    navigator.clipboard.writeText(localIdentity.device_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const copyPassword = () => {
    if (!credentials) return;
    navigator.clipboard.writeText(credentials.access_password);
    setCopiedPw(true);
    setTimeout(() => setCopiedPw(false), 2000);
  };

  const handleRegeneratePassword = async () => {
    setIsRefreshingPw(true);
    try {
      const newCreds = await deviceService.generateNewAccessPassword();
      setCredentials(newCreds);
    } finally {
      setIsRefreshingPw(false);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 flex items-center justify-between select-none sticky top-0 z-20">
      {/* Brand & Local Identity */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">MeshDesk</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 border border-blue-700/50">
                v0.1.0-preview
              </span>
            </div>
            <p className="text-xs text-slate-400">Unified Multi-PC Workspace</p>
          </div>
        </div>

        {/* Local Node Identity & Temporary Access Credentials */}
        {localIdentity && (
          <div className="hidden lg:flex items-center space-x-3">
            {/* Device ID Badge */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                This PC:
              </span>
              <span className="font-mono font-semibold text-slate-200">
                {localIdentity.device_id}
              </span>
              <button
                onClick={copyDeviceId}
                title="Copy your Device ID"
                className="p-1 hover:text-white text-slate-400 hover:bg-slate-700 rounded transition"
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Temporary Access Password */}
            {credentials && (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  Access Key:
                </span>
                <span className="font-mono font-semibold text-amber-300">
                  {credentials.access_password}
                </span>
                <button
                  onClick={copyPassword}
                  title="Copy Access Password"
                  className="p-1 hover:text-white text-slate-400 hover:bg-slate-700 rounded transition"
                >
                  {copiedPw ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={handleRegeneratePassword}
                  disabled={isRefreshingPw}
                  title="Generate new temporary access password"
                  className="p-1 hover:text-white text-slate-400 hover:bg-slate-700 rounded transition"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshingPw ? 'animate-spin text-blue-400' : ''}`}
                  />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-3">
        {activeSessionsCount > 0 && (
          <button
            onClick={onDisconnectAllSessions}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-medium transition"
            title="Immediately terminate all active remote sessions"
          >
            <PowerOff className="w-3.5 h-3.5 text-rose-400" />
            <span>End All ({activeSessionsCount})</span>
          </button>
        )}

        <button
          onClick={onOpenConnectDialog}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 transition active:scale-95"
        >
          <Share2 className="w-4 h-4" />
          <span>Connect by ID</span>
        </button>

        <button
          onClick={onOpenAddDeviceDialog}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs transition"
        >
          <Plus className="w-4 h-4 text-slate-400" />
          <span>Add Device</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 transition"
          title="App Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
