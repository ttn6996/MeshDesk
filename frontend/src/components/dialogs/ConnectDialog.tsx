import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Share2,
  Wifi,
  Globe,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Laptop,
  Smartphone,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { ConnectionMode, Device, HostAccessCredentials } from '../../types';
import { deviceService } from '../../services/deviceService';

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
  const [activeTab, setActiveTab] = useState<'lan' | 'internet' | 'web'>('lan');
  const [deviceId, setDeviceId] = useState(initialDevice?.id || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<HostAccessCredentials | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isOpen) {
      deviceService.getHostAccessCredentials().then(setCredentials);
      if (initialDevice) {
        setDeviceId(initialDevice.hostname || initialDevice.id);
      }
    }
  }, [isOpen, initialDevice]);

  if (!isOpen) return null;

  const webViewerUrl = credentials?.local_ip
    ? `http://${credentials.local_ip}:${credentials.web_viewer_port || 48123}`
    : 'http://127.0.0.1:48123';

  const handleCopyWebLink = () => {
    navigator.clipboard.writeText(webViewerUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleOpenWebLink = () => {
    window.open(webViewerUrl, '_blank');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceId.trim();

    if (!cleanId) {
      setError(
        activeTab === 'lan'
          ? 'Vui lòng nhập địa chỉ IP máy đích (ví dụ: 192.168.0.102)'
          : 'Vui lòng nhập Device ID máy đích (ví dụ: MD-9236-2059)'
      );
      return;
    }

    setError(null);
    const mode: ConnectionMode = activeTab === 'lan' ? 'lan_only' : 'internet_only';
    onConnect(cleanId, password.trim(), mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Dialog Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base tracking-tight">Kết nối Máy tính Từ xa</h3>
              <p className="text-xs text-slate-400">Chọn chế độ kết nối phù hợp nhất</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('lan');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
              activeTab === 'lan'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>Mạng LAN (Wi-Fi)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('internet');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
              activeTab === 'internet'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Từ xa (Internet)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('web');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
              activeTab === 'web'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Web Viewer</span>
          </button>
        </div>

        {/* Tab 1: LAN & Tab 2: Internet Remote */}
        {activeTab !== 'web' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 flex items-start space-x-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {activeTab === 'lan' ? (
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-900/50 flex items-center space-x-3 text-xs text-blue-300">
                <Wifi className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>
                  <strong>1-Click Direct LAN:</strong> Kết nối trực tiếp siêu tốc giữa 2 máy cùng Wi-Fi. Không cần mật khẩu.
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/50 flex items-center space-x-3 text-xs text-indigo-300">
                <Radio className="w-4 h-4 text-indigo-400 flex-shrink-0 animate-pulse" />
                <span>
                  <strong>Internet Remote:</strong> Kết nối xuyên mạng qua Signaling & Relay Server khi 2 máy ở 2 nơi khác nhau.
                </span>
              </div>
            )}

            {/* Target ID / IP Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                {activeTab === 'lan' ? 'Địa chỉ IP máy đích (LAN)' : 'Mã máy đích (Device ID)'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={activeTab === 'lan' ? 'Ví dụ: 192.168.0.102' : 'Ví dụ: MD-9236-2059'}
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    setError(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-mono tracking-wider placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  autoFocus
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Mật khẩu truy cập
                </label>
                {activeTab === 'lan' && (
                  <span className="text-[11px] text-emerald-400 font-medium">Tùy chọn trên LAN</span>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="password"
                  placeholder={
                    activeTab === 'lan'
                      ? 'Để trống để kết nối 1-chạm (1-Click Connect)'
                      : 'Nhập mật khẩu 6 số của máy đích'
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Hủy
              </button>
              <button
                type="submit"
                className={`px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition active:scale-95 flex items-center gap-2 ${
                  activeTab === 'lan'
                    ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                }`}
              >
                <span>Bắt đầu Kết nối</span>
              </button>
            </div>
          </form>
        ) : (
          /* Tab 3: HTML5 Web Viewer (No app needed) */
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-900/60 flex items-start space-x-3">
              <Smartphone className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <p className="font-bold text-emerald-300 text-sm">
                  Điều khiển trực tiếp trên Trình duyệt Web
                </p>
                <p className="text-slate-400">
                  Máy thứ 2 (Điện thoại iPhone/Android, iPad, Laptop) <strong>hoàn toàn không cần cài bất kỳ phần mềm nào</strong>!
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Đường dẫn truy cập Web Viewer:
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-xs text-emerald-400 select-all overflow-x-auto truncate">
                  {webViewerUrl}
                </div>
                <button
                  type="button"
                  onClick={handleCopyWebLink}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition flex-shrink-0"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleOpenWebLink}
                  className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex-shrink-0"
                  title="Mở ngay trên trình duyệt"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                Cách sử dụng đơn giản:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                <li>Mở trình duyệt (Chrome, Safari, Edge) trên điện thoại hoặc máy tính thứ 2.</li>
                <li>Dán đường dẫn <code className="text-emerald-400 font-mono">{webViewerUrl}</code> và truy cập.</li>
                <li>Xem màn hình máy tính trực tiếp ~24 FPS và chạm/click chuột điều khiển ngay lập tức!</li>
              </ol>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
