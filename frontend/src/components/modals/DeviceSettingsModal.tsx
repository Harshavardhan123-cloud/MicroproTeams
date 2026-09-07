import React, { useEffect, useState } from 'react';
import { Camera, Mic, Volume2, X, Check, RefreshCw, Settings, Sliders, MonitorUp, RotateCcw, ShieldCheck } from 'lucide-react';

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
}

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCameraId?: string;
  selectedMicId?: string;
  selectedSpeakerId?: string;
  onSelectCamera: (deviceId: string) => void;
  onSelectMic: (deviceId: string) => void;
  onSelectSpeaker: (deviceId: string) => void;
  onRejoinSession?: () => void;
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedCameraId,
  selectedMicId,
  selectedSpeakerId,
  onSelectCamera,
  onSelectMic,
  onSelectSpeaker,
  onRejoinSession,
  isScreenSharing,
  onToggleScreenShare
}) => {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rejoinStatus, setRejoinStatus] = useState<string | null>(null);

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;

      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameraList: MediaDeviceInfo[] = [];
      const micList: MediaDeviceInfo[] = [];
      const speakerList: MediaDeviceInfo[] = [];

      devices.forEach((d, idx) => {
        const item = {
          deviceId: d.deviceId,
          label: d.label || `${d.kind.replace('input', '').replace('output', '')} ${idx + 1}`
        };
        if (d.kind === 'videoinput') cameraList.push(item);
        else if (d.kind === 'audioinput') micList.push(item);
        else if (d.kind === 'audiooutput') speakerList.push(item);
      });

      setCameras(cameraList.length > 0 ? cameraList : [{ deviceId: 'default', label: 'Default Integrated Camera' }]);
      setMics(micList.length > 0 ? micList : [{ deviceId: 'default', label: 'Default Integrated Microphone' }]);
      setSpeakers(speakerList.length > 0 ? speakerList : [{ deviceId: 'default', label: 'Default System Speaker' }]);
    } catch (err) {
      console.error('Failed to enumerate media devices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDevices();
      setRejoinStatus(null);
    }
  }, [isOpen]);

  const handleRejoinClick = () => {
    if (onRejoinSession) {
      onRejoinSession();
      setRejoinStatus('Rejoining SFU session & refreshing media tracks...');
      setTimeout(() => setRejoinStatus(null), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999999] p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#1E1E22] border border-teams-purple/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-0 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#25252A] border-b border-[#323238] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teams-purple/20 border border-teams-purple/40 flex items-center justify-center text-teams-purple">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Meeting & Device Settings</h3>
              <p className="text-xs text-teams-muted">Audio, video, permissions, and media auto-refresh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-teams-muted hover:text-white rounded-lg hover:bg-[#323238] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Device Controls */}
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Camera Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-teams-text flex items-center gap-2">
              <Camera className="w-4 h-4 text-teams-purple" />
              <span>Camera Device</span>
            </label>
            <select
              value={selectedCameraId || (cameras[0]?.deviceId || 'default')}
              onChange={(e) => onSelectCamera(e.target.value)}
              className="w-full bg-[#141416] border border-[#323238] focus:border-teams-purple rounded-xl px-3 py-2.5 text-xs text-white outline-none transition-colors"
            >
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label}
                </option>
              ))}
            </select>
          </div>

          {/* Microphone Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-teams-text flex items-center gap-2">
              <Mic className="w-4 h-4 text-emerald-400" />
              <span>Microphone Input</span>
            </label>
            <select
              value={selectedMicId || (mics[0]?.deviceId || 'default')}
              onChange={(e) => onSelectMic(e.target.value)}
              className="w-full bg-[#141416] border border-[#323238] focus:border-teams-purple rounded-xl px-3 py-2.5 text-xs text-white outline-none transition-colors"
            >
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Speaker Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-teams-text flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>Speaker / Audio Output</span>
            </label>
            <select
              value={selectedSpeakerId || (speakers[0]?.deviceId || 'default')}
              onChange={(e) => onSelectSpeaker(e.target.value)}
              className="w-full bg-[#141416] border border-[#323238] focus:border-teams-purple rounded-xl px-3 py-2.5 text-xs text-white outline-none transition-colors"
            >
              {speakers.map((s) => (
                <option key={s.deviceId} value={s.deviceId}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="h-px bg-[#2F2F35]" />

          {/* Meeting Permissions & Screen Share Controls */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-teams-purple uppercase tracking-wider">Screen Share & Meeting Controls</h4>
            
            <div className="bg-[#141416] p-3 rounded-xl border border-[#323238] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">Screen Sharing Permission</div>
                  <div className="text-[10px] text-teams-muted">Browser display capture status</div>
                </div>
              </div>
              {onToggleScreenShare && (
                <button
                  onClick={onToggleScreenShare}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isScreenSharing 
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30' 
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                  }`}
                >
                  {isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
                </button>
              )}
            </div>

            {/* Rejoin / Auto-Refresh Section */}
            <div className="bg-[#141416] p-3 rounded-xl border border-[#323238] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">Auto-Refresh & Rejoin</div>
                  <div className="text-[10px] text-teams-muted">Re-sync WebRTC SFU consumer streams</div>
                </div>
              </div>
              <button
                onClick={handleRejoinClick}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rejoin / Re-sync</span>
              </button>
            </div>

            {rejoinStatus && (
              <div className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-medium animate-pulse">
                ✓ {rejoinStatus}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#18181A] border-t border-[#2A2A2E] flex items-center justify-between">
          <button
            onClick={loadDevices}
            disabled={isLoading}
            className="text-xs font-semibold text-teams-purple hover:underline flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Rescan Devices</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-teams-purple hover:bg-teams-purple-hover rounded-xl shadow-lg shadow-teams-purple/20 transition-all flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Apply & Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
