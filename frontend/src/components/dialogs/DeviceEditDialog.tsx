import React, { useState, useEffect } from 'react';
import { X, Save, Laptop } from 'lucide-react';
import { Device } from '../../types';

interface DeviceEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (device: Device) => void;
  device?: Device | null;
}

export const DeviceEditDialog: React.FC<DeviceEditDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  device,
}) => {
  const isEditing = !!device;
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [hostname, setHostname] = useState('');
  const [osInfo, setOsInfo] = useState('Windows 11 Pro x64');
  const [tagsStr, setTagsStr] = useState('');
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      setName(device.name);
      setId(device.id);
      setHostname(device.hostname || '');
      setOsInfo(device.os_info);
      setTagsStr(device.tags.join(', '));
      setNotes(device.notes || '');
      setIsFavorite(device.is_favorite);
    } else {
      setName('');
      // Generate a random valid format ID suggestion
      const p1 = Math.floor(1000 + Math.random() * 9000);
      const p2 = Math.floor(1000 + Math.random() * 9000);
      setId(`MD-${p1}-${p2}`);
      setHostname('');
      setOsInfo('Windows 11 Pro x64');
      setTagsStr('workstation');
      setNotes('');
      setIsFavorite(false);
    }
    setError(null);
  }, [device, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = id.trim().toUpperCase();

    const pattern = /^MD-\d{4}-\d{4}$/;
    if (!pattern.test(cleanId)) {
      setError('Device ID must match format MD-XXXX-XXXX');
      return;
    }

    if (!name.trim()) {
      setError('Please provide a descriptive device name');
      return;
    }

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const updatedDevice: Device = {
      id: cleanId,
      name: name.trim(),
      hostname: hostname.trim() || undefined,
      status: device ? device.status : 'offline',
      os_info: osInfo.trim() || 'Windows 11 Pro x64',
      last_seen: device ? device.last_seen : new Date().toISOString(),
      tags,
      notes: notes.trim() || undefined,
      latency_ms: device?.latency_ms,
      is_favorite: isFavorite,
    };

    onSave(updatedDevice);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                {isEditing ? 'Edit Workstation Details' : 'Register New Device'}
              </h3>
              <p className="text-xs text-slate-400">Persistent device registry</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Device Display Name
            </label>
            <input
              type="text"
              placeholder="e.g. Build-Server-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Device ID</label>
              <input
                type="text"
                placeholder="MD-8192-3021"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                disabled={isEditing}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                LAN Host / IP (Optional)
              </label>
              <input
                type="text"
                placeholder="192.168.1.50"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">OS Platform</label>
            <input
              type="text"
              placeholder="Windows 11 Pro x64"
              value={osInfo}
              onChange={(e) => setOsInfo(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Tags (comma separated)
            </label>
            <input
              type="text"
              placeholder="build, lab, gpu"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Specifications or location details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="fav-check"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <label htmlFor="fav-check" className="text-xs text-slate-300 cursor-pointer">
              Mark as Favorite Workstation
            </label>
          </div>

          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/25 transition active:scale-95 flex items-center space-x-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Save Changes' : 'Register Device'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
