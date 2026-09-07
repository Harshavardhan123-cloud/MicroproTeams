import React from 'react';
import { X, Info, CheckCircle2, Shield, Heart, GripHorizontal } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useDraggable } from '../../hooks/useDraggable';
import { MicroproLogo } from '../common/MicroproLogo';

export const AboutModal: React.FC = () => {
  const { isAboutOpen, setAboutOpen } = useUIStore();
  const draggable = useDraggable();

  if (!isAboutOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 select-none">
      <div 
        style={draggable.style}
        onMouseDown={draggable.handleDragStart}
        onTouchStart={draggable.handleDragStart}
        className={`bg-[#11131A] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 cursor-grab active:cursor-grabbing ${draggable.position ? 'fixed z-50' : 'relative'}`}
      >
        {/* Header */}
        <div className="p-4 bg-[#171923] border-b border-white/5 flex items-center justify-between cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2.5">
            <GripHorizontal className="w-4 h-4 text-mc-muted" />
            <Info className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm text-white font-display">About Micropro_Commute</h3>
              <p className="text-[11px] text-mc-muted">Enterprise Collaboration Platform</p>
            </div>
          </div>
          <button
            onClick={() => setAboutOpen(false)}
            className="p-1 rounded-lg hover:bg-white/10 text-mc-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#141824] border border-white/10 flex items-center justify-center mx-auto shadow-xl shadow-indigo-600/20">
            <MicroproLogo className="w-12 h-12" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white font-display">Micropro_Commute v3.0</h2>
            <p className="text-xs text-indigo-400 font-semibold mt-0.5">Enterprise Secured Workspace Engine</p>
          </div>

          <div className="p-4 bg-[#171923] rounded-xl border border-white/5 space-y-2 text-left text-xs">
            <div className="flex items-center justify-between text-mc-secondary">
              <span>Backend Core:</span>
              <span className="font-bold text-white">FastAPI (Python 3.11)</span>
            </div>
            <div className="flex items-center justify-between text-mc-secondary">
              <span>WebRTC SFU:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mediasoup v3
              </span>
            </div>
            <div className="flex items-center justify-between text-mc-secondary">
              <span>Security Auth:</span>
              <span className="font-bold text-indigo-300">6-Digit Email OTP</span>
            </div>
            <div className="flex items-center justify-between text-mc-secondary">
              <span>UI Framework:</span>
              <span className="font-bold text-white">React 18 + Vite + Tailwind</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                if ((window as any).electronNotify) {
                  (window as any).electronUpdater?.checkForUpdate?.();
                } else {
                  alert('You are running the Web version of MicroproTeams. Web builds are automatically updated on refresh.');
                }
              }}
              className="w-full py-2.5 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md"
            >
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>Check for OTA Updates</span>
            </button>
          </div>

          <p className="text-[11px] text-mc-muted leading-relaxed">
            Designed for high-concurrency enterprise video conferencing, real-time channels, and AI-powered meeting transcripts.
          </p>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#171923] border-t border-white/5 text-center text-[10px] text-mc-muted flex items-center justify-center gap-1">
          <span>Crafted with</span> <Heart className="w-3 h-3 text-rose-500 fill-current inline" /> <span>for Enterprise Productivity</span>
        </div>
      </div>
    </div>
  );
};
