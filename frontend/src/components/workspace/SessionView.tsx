import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  Power,
  Activity,
  ShieldCheck,
  MousePointer,
  Keyboard,
  Monitor,
  Wifi,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { SessionFrameEvent, SessionInfo } from '../../types';
import { deviceService } from '../../services/deviceService';

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
  const [currentFps, setCurrentFps] = useState<number>(0);
  const [resolution, setResolution] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });
  const [frameCount, setFrameCount] = useState<number>(0);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameCounterRef = useRef<number>(0);
  const lastMouseTimeRef = useRef<number>(0);

  const activeSession = sessions.find((s) => s.session_id === activeSessionId) || sessions[0];

  // Subscribe to incoming Tauri video frames
  useEffect(() => {
    if (!deviceService.isTauriEnvironment() || !activeSession || activeSession.state !== 'connected') {
      return;
    }

    let unlistenFn: (() => void) | null = null;

    listen<SessionFrameEvent>('session-frame', (event) => {
      const payload = event.payload;
      if (payload.session_id !== activeSession.session_id) {
        return;
      }

      frameCounterRef.current += 1;
      setFrameCount((prev) => prev + 1);

      if (payload.width > 0 && payload.height > 0) {
        setResolution({ width: payload.width, height: payload.height });
      }

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (canvas.width !== payload.width || canvas.height !== payload.height) {
          canvas.width = payload.width;
          canvas.height = payload.height;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      };
      img.src = `data:image/jpeg;base64,${payload.data_b64}`;
    }).then((unlisten) => {
      unlistenFn = unlisten;
    }).catch((err) => {
      console.warn('Failed to attach session-frame listener:', err);
    });

    // FPS calculation timer
    const fpsInterval = setInterval(() => {
      setCurrentFps(frameCounterRef.current);
      frameCounterRef.current = 0;
    }, 1000);

    return () => {
      if (unlistenFn) unlistenFn();
      clearInterval(fpsInterval);
    };
  }, [activeSession?.session_id, activeSession?.state]);

  // Handle Mouse Events & Send to Host
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || activeSession?.is_simulated) return;

      const now = performance.now();
      // Throttle mouse movement to ~30 FPS (every 33ms) to prevent network saturation
      if (now - lastMouseTimeRef.current < 33) return;
      lastMouseTimeRef.current = now;

      const rect = canvasRef.current.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      deviceService.sendSessionInput({
        MouseMove: { x: normX, y: normY },
      });
    },
    [activeSession?.is_simulated]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeSession?.is_simulated) return;
      deviceService.sendSessionInput({
        MouseDown: { button: e.button },
      });
    },
    [activeSession?.is_simulated]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeSession?.is_simulated) return;
      deviceService.sendSessionInput({
        MouseUp: { button: e.button },
      });
    },
    [activeSession?.is_simulated]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (activeSession?.is_simulated) return;
      e.preventDefault();
      const deltaY = Math.sign(e.deltaY) * 120;
      deviceService.sendSessionInput({
        MouseWheel: { delta_y: deltaY },
      });
    },
    [activeSession?.is_simulated]
  );

  // Handle Keyboard Events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (activeSession?.is_simulated) return;
      // Prevent browser default actions like Ctrl+W or F5 while interacting with remote session
      if (e.key === 'Tab' || e.key === 'Alt') {
        e.preventDefault();
      }
      deviceService.sendSessionInput({
        KeyDown: { key_code: e.keyCode },
      });
    },
    [activeSession?.is_simulated]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (activeSession?.is_simulated) return;
      deviceService.sendSessionInput({
        KeyUp: { key_code: e.keyCode },
      });
    },
    [activeSession?.is_simulated]
  );

  if (!activeSession) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onFocus={() => setIsInputFocused(true)}
      onBlur={() => setIsInputFocused(false)}
      className={`flex flex-col bg-slate-950 outline-none select-none ${
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
          {activeSession.is_simulated ? (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800/50 text-[10px] text-amber-300 font-semibold">
              Simulation Sandbox
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/50 text-[10px] text-emerald-300 font-semibold">
              <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" />
              Live Direct Stream (M2/M3)
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
      <div className="flex-1 bg-slate-950 relative flex items-center justify-center overflow-hidden">
        {activeSession.state === 'connecting' ||
        activeSession.state === 'resolving' ||
        activeSession.state === 'authenticating' ? (
          <div className="text-center p-8 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur max-w-sm">
            <div className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin mx-auto mb-4" />
            <h3 className="text-base font-semibold text-slate-100 capitalize">
              {activeSession.state} to {activeSession.target_device_name}...
            </h3>
            <p className="text-xs text-slate-400 mt-2 font-mono">
              Target Node: {activeSession.target_device_id}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Establishing TCP stream & verifying BLAKE3 credentials
            </p>
          </div>
        ) : activeSession.state === 'connected' ? (
          <div className="w-full h-full relative flex items-center justify-center bg-black">
            {/* Live Interactive Canvas */}
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              className="max-w-full max-h-full object-contain cursor-crosshair shadow-2xl"
              style={{
                imageRendering: 'auto',
              }}
            />

            {/* In case no frame has arrived yet in real stream */}
            {frameCount === 0 && !activeSession.is_simulated && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-none">
                <div className="w-10 h-10 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin mb-3" />
                <p className="text-sm font-semibold text-slate-200">
                  Waiting for initial video frame...
                </p>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Target: {activeSession.target_device_id} (GDI BitBlt ~24 FPS)
                </p>
              </div>
            )}

            {/* Simulation Overlay if testing without live host */}
            {activeSession.is_simulated && (
              <div className="absolute inset-0 flex flex-col justify-between p-6 pointer-events-none">
                <div className="flex justify-between items-center bg-slate-900/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-800 max-w-fit">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 mr-2" />
                  <span className="text-xs font-semibold text-slate-200">
                    Simulation Session: {activeSession.target_device_name}
                  </span>
                </div>
                <div className="text-center p-6 max-w-md mx-auto bg-slate-900/90 rounded-2xl border border-slate-800 backdrop-blur">
                  <Monitor className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                  <h4 className="text-base font-bold text-slate-100">
                    Interactive Workspace Ready
                  </h4>
                  <p className="text-xs text-slate-400 mt-2">
                    To start a live stream, connect to a discovered LAN host using port 48120 and the host access password.
                  </p>
                </div>
                <div />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-6 text-rose-400">
            <p className="font-semibold text-base">Session Disconnected</p>
            <p className="text-xs text-slate-400 mt-2">
              {activeSession.error_message || 'The connection was terminated.'}
            </p>
          </div>
        )}
      </div>

      {/* Live Stream Telemetry & Control HUD */}
      <footer className="h-8 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between text-[11px] text-slate-400 font-mono select-none">
        <div className="flex items-center space-x-4">
          <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            {activeSession.connection_type === 'lan' ? 'LAN Direct' : 'Internet'}
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-blue-400" />
            {currentFps > 0 ? `${currentFps} FPS` : activeSession.state === 'connected' ? '24 FPS target' : '0 FPS'}
          </span>
          <span>
            {resolution.width}x{resolution.height}
          </span>
          <span className="hidden sm:inline text-slate-500">
            Frames: {frameCount}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            Host Consent Active
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            {isInputFocused ? (
              <span className="flex items-center gap-1 text-blue-400">
                <MousePointer className="w-3 h-3" />
                <Keyboard className="w-3 h-3" />
                Input Captured
              </span>
            ) : (
              <span className="text-slate-500">Click to focus input</span>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
};
