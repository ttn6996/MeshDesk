import React, { useState } from 'react';
import {
  Grid,
  List,
  Monitor,
  Laptop,
  CheckCircle2,
  Clock,
  Plus,
  Radar,
} from 'lucide-react';
import { Device } from '../../types';
import { DeviceCard } from './DeviceCard';

interface WorkspaceViewProps {
  devices: Device[];
  selectedCategory: string;
  searchQuery: string;
  activeSessionsCount: number;
  onConnect: (device: Device) => void;
  onEdit: (device: Device) => void;
  onDelete: (deviceId: string) => void;
  onToggleFavorite: (device: Device) => void;
  onOpenAddDevice: () => void;
  onScanLan?: () => void;
  isScanningLan?: boolean;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  devices,
  selectedCategory,
  searchQuery,
  activeSessionsCount,
  onConnect,
  onEdit,
  onDelete,
  onToggleFavorite,
  onOpenAddDevice,
  onScanLan,
  isScanningLan,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filter devices
  const filtered = devices.filter((d) => {
    // category filter
    if (selectedCategory === 'favorites' && !d.is_favorite) return false;
    if (selectedCategory === 'lan' && d.status !== 'online') return false;

    // search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = d.name.toLowerCase().includes(q);
      const matchId = d.id.toLowerCase().includes(q);
      const matchTags = d.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchId && !matchTags) return false;
    }
    return true;
  });

  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const devicesWithLatency = devices.filter((d) => d.latency_ms !== undefined);
  const avgLatency =
    devicesWithLatency.length > 0
      ? Math.round(
          devicesWithLatency.reduce((acc, d) => acc + (d.latency_ms || 0), 0) /
            devicesWithLatency.length
        )
      : null;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Overview Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Sessions
            </span>
            <div className="text-2xl font-bold text-white mt-1">{activeSessionsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Monitor className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Online Nodes
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {onlineCount} <span className="text-xs text-slate-500 font-normal">/ {devices.length}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Workspace Devices
            </span>
            <div className="text-2xl font-bold text-white mt-1">{devices.length}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Laptop className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              LAN Avg Ping
            </span>
            <div className="text-2xl font-bold text-slate-200 mt-1">
              {avgLatency !== null ? (
                <>
                  {avgLatency} <span className="text-xs text-slate-500 font-normal">ms</span>
                </>
              ) : (
                <span className="text-sm text-slate-500 font-normal">No Live Node</span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Workspace Bar: Title & View Switcher */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white capitalize">
            {selectedCategory === 'all'
              ? 'Multi-PC Workstation Grid'
              : selectedCategory === 'favorites'
              ? 'Favorite Computers'
              : 'Local Network (LAN) Nodes'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Showing {filtered.length} of {devices.length} registered workstations
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center space-x-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition ${
              viewMode === 'grid'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Devices View */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
          <Monitor className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">No computers found yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Scan your local Wi-Fi / LAN to discover other active computers, or add a device ID directly.
          </p>
          <div className="mt-4 flex items-center justify-center space-x-3">
            {onScanLan && (
              <button
                onClick={onScanLan}
                disabled={isScanningLan}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50"
              >
                <Radar className={`w-4 h-4 ${isScanningLan ? 'animate-spin' : ''}`} />
                <span>{isScanningLan ? 'Scanning Wi-Fi...' : 'Scan Local Wi-Fi'}</span>
              </button>
            )}
            <button
              onClick={onOpenAddDevice}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Device</span>
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onConnect={onConnect}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        /* List / Table View */
        <div className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Device Name</th>
                <th className="px-4 py-3">Device ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">LAN Host</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filtered.map((device) => (
                <tr key={device.id} className="hover:bg-slate-800/50 transition">
                  <td className="px-4 py-3 font-semibold text-slate-200">{device.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{device.id}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        device.status === 'online'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                          : device.status === 'busy'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {device.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{device.os_info}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {device.hostname || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {device.latency_ms ? `${device.latency_ms} ms` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => onConnect(device)}
                      disabled={device.status === 'offline'}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                        device.status === 'offline'
                          ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => onEdit(device)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
