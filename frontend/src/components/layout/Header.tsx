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
  Radar,
  Laptop,
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
  onScanLan?: () => void;
  isScanningLan?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  localIdentity,
  activeSessionsCount,
  onOpenConnectDialog,
  onOpenAddDeviceDialog,
  onOpenSettings,
  onDisconnectAllSessions,
  onScanLan,
  isScanningLan,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);
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

  const copyWebUrl = () => {
    if (!credentials) return;
    const url = `http://${credentials.local_ip || '127.0.0.1'}:${credentials.web_viewer_port || 48123}`;
    navigator.clipboard.writeText(url);
    setCopiedWeb(true);
    setTimeout(() => setCopiedWeb(false), 2000);
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
    <header className="h-16 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-6 flex items-center justify-between select-none sticky top-0 z-20 shadow-md shadow-black/20">
      {/* Brand & Local Identity */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">MeshDesk</span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                v0.1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Unified Multi-PC Workspace</p>
          </div>
        </div>

        {/* Local Node Identity & Web Viewer Quick Credentials */}
        {localIdentity && (
          <div className="hidden lg:flex items-center space-x-2.5">
            {/* Device ID Badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/70 text-xs shadow-sm">
              <span className="text-slate-400 flex items-center gap-1 font-medium">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Mã máy:
              </span>
              <span className="font-mono font-bold text-white tracking-wide">
                {localIdentity.device_id}
              </span>
              <button
                onClick={copyDeviceId}
                title="Sao chép Device ID"
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
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/70 text-xs shadow-sm">
                <span className="text-slate-400 flex items-center gap-1 font-medium">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  Mật khẩu:
                </span>
                <span className="font-mono font-bold text-amber-300 tracking-wider">
                  {credentials.access_password}
                </span>
                <button
                  onClick={copyPassword}
                  title="Sao chép mật khẩu"
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
                  title="Đổi mật khẩu mới"
                  className="p-1 hover:text-white text-slate-400 hover:bg-slate-700 rounded transition"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshingPw ? 'animate-spin text-blue-400' : ''}`}
                  />
                </button>
              </div>
            )}

            {/* Web Viewer Quick Pill */}
            {credentials?.local_ip && (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-xs shadow-sm">
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <Laptop className="w-3.5 h-3.5" />
                  Web Viewer:
                </span>
                <span className="font-mono text-emerald-200">
                  :{credentials.web_viewer_port || 48123}
                </span>
                <button
                  onClick={copyWebUrl}
                  title={`Sao chép link Web Viewer (http://${credentials.local_ip}:${credentials.web_viewer_port || 48123})`}
                  className="p-1 hover:text-white text-emerald-400 hover:bg-emerald-900/40 rounded transition"
                >
                  {copiedWeb ? (
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2.5">
        {activeSessionsCount > 0 && (
          <button
            onClick={onDisconnectAllSessions}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition"
            title="Ngắt tất cả các phiên làm việc đang chạy"
          >
            <PowerOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Ngắt hết ({activeSessionsCount})</span>
          </button>
        )}

        {onScanLan && (
          <button
            onClick={onScanLan}
            disabled={isScanningLan}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition disabled:opacity-50 shadow-sm"
            title="Quét mạng LAN / Wi-Fi tìm các máy tính đang bật"
          >
            <Radar className={`w-4 h-4 text-emerald-400 ${isScanningLan ? 'animate-spin' : ''}`} />
            <span>{isScanningLan ? 'Đang quét...' : 'Quét LAN'}</span>
          </button>
        )}

        <button
          onClick={onOpenConnectDialog}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/25 transition active:scale-95"
        >
          <Share2 className="w-4 h-4" />
          <span>Kết nối máy khác</span>
        </button>

        <button
          onClick={onOpenAddDeviceDialog}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition"
        >
          <Plus className="w-4 h-4 text-slate-400" />
          <span>Thêm máy</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
          title="Cài đặt hệ thống"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
