import React from 'react';
import {
  Monitor,
  Star,
  Play,
  Edit2,
  Trash2,
  Clock,
  Wifi,
  HardDrive,
} from 'lucide-react';
import { Device } from '../../types';

interface DeviceCardProps {
  device: Device;
  onConnect: (device: Device) => void;
  onEdit: (device: Device) => void;
  onDelete: (deviceId: string) => void;
  onToggleFavorite: (device: Device) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onConnect,
  onEdit,
  onDelete,
  onToggleFavorite,
}) => {
  const isOnline = device.status === 'online';
  const isBusy = device.status === 'busy';

  return (
    <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-lg hover:shadow-black/40 group relative">
      {/* Top row: Status, Name, Favorite & Menu */}
      <div>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center border transition ${
                isOnline
                  ? 'bg-blue-950/60 border-blue-700/50 text-blue-400'
                  : isBusy
                  ? 'bg-amber-950/60 border-amber-700/50 text-amber-400'
                  : 'bg-slate-800/60 border-slate-700 text-slate-500'
              }`}
            >
              <Monitor className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-slate-100 text-sm group-hover:text-blue-400 transition">
                  {device.name}
                </h3>
                <button
                  onClick={() => onToggleFavorite(device)}
                  className="text-slate-500 hover:text-amber-400 transition"
                  title={device.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      device.is_favorite ? 'text-amber-400 fill-amber-400' : ''
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs font-mono text-slate-400">{device.id}</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center space-x-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                isOnline
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                  : isBusy
                  ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  isOnline
                    ? 'bg-emerald-400 animate-pulse'
                    : isBusy
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              />
              {device.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Metadata info */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate">{device.os_info}</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <Wifi className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate font-mono">
              {device.hostname || 'Internet Relay'}
            </span>
          </div>

          {device.latency_ms ? (
            <div className="flex items-center space-x-1.5 col-span-2 text-emerald-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Network Latency: {device.latency_ms} ms</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 col-span-2 text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Link Status: Idle (Not connected)</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {device.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {device.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 text-[10px] border border-slate-700/60 font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Card Actions Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
        <button
          onClick={() => onConnect(device)}
          className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Connect</span>
        </button>

        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={() => onEdit(device)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            title="Edit device properties"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(device.id)}
            className="p-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition"
            title="Remove device from registry"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
