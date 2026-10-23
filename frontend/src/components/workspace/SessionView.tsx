import React, { useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Power,
  Activity,
  ShieldAlert,
  Wifi,
  MousePointer,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { SessionInfo } from '../../types';

interface SessionViewProps {
  sessions: SessionInfo[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
}

export const SessionView: React.FC<SessionViewProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCloseSession,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeSession = sessions.find((s) => s.session_id === activeSessionId) || sessions[0];

  if (!activeSession) return null;

  return (
    <div
      className={`flex flex-col bg-slate-950 ${
        isFullscreen ? 'fixed inset-0 z-50' : 'h-full flex-1'
      }`}
    >
      {/* Session Tab Navigation Bar */}
      <div className="h-11 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 select-none">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
          {sessions.map((sess) => {
            const isActive = sess.session_id === activeSession.session_id;
            return (
              <div
                key={sess.session_id}
                onClick={() => onSelectSession(sess.session_id)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition border ${
                  isActive
                    ? 'bg-slate-800 text-blue-400 border-slate-700 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 border-transparent hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    sess.state === 'connected'
                      ? 'bg-emerald-400'
                      : sess.state === 'failed'
                      ? 'bg-rose-500'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="font-semibold truncate max-w-[140px]">
                  {sess.target_device_name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseSession(sess.session_id);
                  }}
                  className="p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition"
                  title="Close session"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center space-x-2">
          {activeSession.is_simulated && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800/50 text-[10px] text-amber-300 font-semibold">
              <ShieldAlert className="w-3 h-3 mr-1 text-amber-400" />
              Simulated Session (Milestone 1)
            </span>
          )}

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => onCloseSession(activeSession.session_id)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition"
            title="Terminate this session"
          >
            <Power className="w-3.5 h-3.5 text-rose-400" />
            <span>Disconnect</span>
          </button>
        </div>
      </div>

      {/* Main Session Viewport Area */}
      <div className="flex-1 bg-slate-900 relative flex items-center justify-center overflow-hidden">
        {activeSession.state === 'connecting' ||
        activeSession.state === 'resolving' ||
        activeSession.state === 'authenticating' ? (
          <div className="text-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur max-w-sm">
            <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
            <h3 className="text-base font-semibold text-slate-100 capitalize">
              {activeSession.state} to {activeSession.target_device_name}...
            </h3>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Target Node: {activeSession.target_device_id}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Negotiating Ed25519 signature & PBKDF2 challenge
            </p>
          </div>
        ) : activeSession.state === 'connected' ? (
          /* Simulated Windows Remote Desktop Workspace Canvas */
          <div className="w-full h-full relative flex flex-col justify-between bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-inner select-none overflow-hidden">
            {/* Remote Desktop Header Banner */}
            <div className="p-4 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-3 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-slate-200">
                  Remote Host: {activeSession.target_device_name}
                </span>
                <span className="text-slate-500">({activeSession.target_device_id})</span>
              </div>

              <div className="flex items-center space-x-4 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 font-mono text-[11px]">
                <span className="text-emerald-400 flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5" />
                  {activeSession.latency_ms || 14} ms
                </span>
                <span className="text-blue-400">{activeSession.fps || 60} FPS</span>
                <span className="text-slate-400">1920 x 1080 (100%)</span>
              </div>
            </div>

            {/* Simulated Desktop Center Graphic */}
            <div className="text-center p-6 max-w-lg mx-auto bg-slate-950/60 rounded-xl border border-slate-800/80 backdrop-blur">
              <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-4 text-blue-400">
                <Sparkles className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-100">
                {activeSession.target_device_name} Connected
              </h4>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                You are securely connected to node{' '}
                <span className="font-mono text-slate-300">{activeSession.target_device_id}</span>.
                Input events and viewport coordinates are isolated to this active session tab.
              </p>
              <div className="mt-4 flex items-center justify-center space-x-6 text-xs text-slate-400 border-t border-slate-800 pt-3">
                <span className="flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5 text-blue-400" />
                  Mouse Active
                </span>
                <span className="flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5 text-blue-400" />
                  Keyboard Captured
                </span>
              </div>
            </div>

            {/* Simulated Remote Desktop Taskbar */}
            <div className="h-10 bg-slate-950/90 border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-[10px]">
                  ⊞
                </div>
                <span className="text-slate-300 font-medium">Windows 11 Remote Workspace</span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                <span>Direct LAN Connection</span>
                <span>ENC: TLS 1.3</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-6 text-rose-400">
            <p className="font-semibold">Session Failed or Terminated</p>
            <p className="text-xs text-slate-400 mt-1">
              {activeSession.error_message || 'The connection was closed.'}
            </p>
          </div>
        )}
      </div>

      {/* Diagnostics / Status Telemetry Bar */}
      <footer className="h-7 bg-slate-950 border-t border-slate-800 px-4 flex items-center justify-between text-[11px] text-slate-500 font-mono select-none">
        <div className="flex items-center space-x-4">
          <span className="flex items-center gap-1 text-slate-400">
            <Activity className="w-3 h-3 text-emerald-400" />
            Session ID: {activeSession.session_id.slice(0, 16)}...
          </span>
          <span>Transport: {activeSession.connection_type.toUpperCase()}</span>
        </div>
        <div className="flex items-center space-x-4">
          <span>TX: {(activeSession.bytes_sent / 1024).toFixed(1)} KB</span>
          <span>RX: {(activeSession.bytes_received / 1024).toFixed(1)} KB</span>
        </div>
      </footer>
    </div>
  );
};
