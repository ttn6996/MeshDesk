import React, { useState } from 'react';
import { X, Lock, Share2, Shield, Wifi, Globe, AlertCircle } from 'lucide-react';
import { ConnectionMode, Device } from '../../types';

interface ConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (deviceId: string, password: string, mode: ConnectionMode) => void;
  initialDevice?: Device | null;
}

export const ConnectDialog: React.FC<ConnectDialogProps> = ({
  isOpen,
  onClose,
  onConnect,
  initialDevice,
}) => {
  const [deviceId, setDeviceId] = useState(initialDevice?.id || '');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<ConnectionMode>('auto');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceId.trim().toUpperCase();

    // Syntax validation: MD-XXXX-XXXX
    const pattern = /^MD-\d{4}-\d{4}$/;
    if (!pattern.test(cleanId)) {
      setError('Device ID must be in format MD-XXXX-XXXX (e.g. MD-8192-3021)');
      return;
    }

    if (!password.trim()) {
      setError('Please enter the temporary access password shown on target host');
      return;
    }

    setError(null);
    onConnect(cleanId, password, mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">Connect to Remote Computer</h3>
              <p className="text-xs text-slate-400">Enter target Device ID and access password</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 flex items-start space-x-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Device ID Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Target Device ID
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="MD-8192-3021"
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value.toUpperCase());
                  setError(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 font-mono tracking-wider placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition uppercase"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Collision-resistant 8-digit hardware identity
            </p>
          </div>

          {/* Access Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Temporary Access Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Transmitted securely via zero-knowledge challenge-response (never plaintext)
            </p>
          </div>

          {/* Connection Mode Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Connection Topology
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode('auto')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-1 transition ${
                  mode === 'auto'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Auto ICE</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('lan_only')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-1 transition ${
                  mode === 'lan_only'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Direct LAN</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('internet_only')}
                className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex flex-col items-center justify-center gap-1 transition ${
                  mode === 'internet_only'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Signaling P2P</span>
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/25 transition active:scale-95"
            >
              Start Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
