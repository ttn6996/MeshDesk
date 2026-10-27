import React from 'react';
import {
  Laptop,
  Star,
  Search,
  Wifi,
  Activity,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Device } from '../../types';

interface SidebarProps {
  devices: Device[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectDevice: (device: Device) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  devices,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onSelectDevice,
}) => {
  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const favoriteCount = devices.filter((d) => d.is_favorite).length;

  const categories = [
    { id: 'all', label: 'All Devices', icon: Laptop, count: devices.length },
    { id: 'favorites', label: 'Favorites', icon: Star, count: favoriteCount },
    { id: 'lan', label: 'Discovered LAN', icon: Wifi, count: onlineCount },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col h-[calc(100vh-4rem)] select-none">
      {/* Search Input */}
      <div className="p-3 border-b border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filter devices or tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="p-3 space-y-1">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1">
          Workspaces
        </div>
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{cat.label}</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Quick Devices List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1 flex items-center justify-between">
          <span>Active Nodes</span>
          <Activity className="w-3 h-3 text-slate-400" />
        </div>
        {devices.length === 0 ? (
          <div className="px-2 py-6 text-center text-slate-500 text-xs">
            No devices registered
          </div>
        ) : (
          devices.map((device) => {
            const isOnline = device.status === 'online';
            const isBusy = device.status === 'busy';
            return (
              <div
                key={device.id}
                onClick={() => onSelectDevice(device)}
                className="group p-2 rounded-lg hover:bg-slate-800/80 cursor-pointer border border-transparent hover:border-slate-700/60 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOnline
                          ? 'bg-emerald-400 ring-2 ring-emerald-500/20'
                          : isBusy
                          ? 'bg-amber-400 ring-2 ring-amber-500/20'
                          : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-xs font-medium text-slate-200 group-hover:text-blue-400 transition truncate max-w-[120px]">
                      {device.name}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {device.latency_ms && (
                      <span className="text-[10px] font-mono text-slate-500">
                        {device.latency_ms}ms
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition" />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 pl-4 text-[10px] text-slate-500 font-mono">
                  <span>{device.id}</span>
                  <span className="truncate max-w-[80px]">{device.tags[0] || 'node'}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Multi-PC Workspace Hint Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/70">
        <div className="flex items-start space-x-2.5 p-2 rounded-lg bg-blue-950/40 border border-blue-800/30 text-xs">
          <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-slate-400 leading-relaxed">
            <span className="text-slate-200 font-semibold block">Multi-PC Engine:</span>
            Launch multiple sessions to switch across workstations seamlessly.
          </div>
        </div>
      </div>
    </aside>
  );
};
