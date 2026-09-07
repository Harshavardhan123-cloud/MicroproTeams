import React from 'react';
import { X, BookOpen, Shield, Cpu, Zap, Layers, GripHorizontal } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useDraggable } from '../../hooks/useDraggable';

export const DocumentationModal: React.FC = () => {
  const { isDocsOpen, setDocsOpen } = useUIStore();
  const draggable = useDraggable();

  if (!isDocsOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 select-none">
      <div 
        style={draggable.style}
        onMouseDown={draggable.handleDragStart}
        onTouchStart={draggable.handleDragStart}
        className={`bg-[#11131A] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 cursor-grab active:cursor-grabbing ${draggable.position ? 'fixed z-50' : 'relative'}`}
      >
        {/* Header */}
        <div className="p-4 bg-[#171923] border-b border-white/5 flex items-center justify-between cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2.5">
            <GripHorizontal className="w-4 h-4 text-mc-muted" />
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-white font-display">Platform Documentation & Architecture</h3>
              <p className="text-[11px] text-mc-muted">Micropro_Commute Enterprise Specifications</p>
            </div>
          </div>
          <button
            onClick={() => setDocsOpen(false)}
            className="p-1 rounded-lg hover:bg-white/10 text-mc-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 max-h-[500px] overflow-y-auto">
          {/* Section 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs">
              <Cpu className="w-4 h-4" />
              <span>1. Mediasoup SFU WebRTC Engine</span>
            </div>
            <p className="text-xs text-mc-secondary leading-relaxed bg-[#171923]/60 p-3 rounded-xl border border-white/5">
              Micropro_Commute leverages high-throughput Mediasoup SFU (Selective Forwarding Unit) media servers.
              It dynamically allocates audio and video producers/consumers, maintaining crisp 1080p group conferencing with sub-100ms latency.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
              <Shield className="w-4 h-4" />
              <span>2. 6-Digit Email OTP Security Engine</span>
            </div>
            <p className="text-xs text-mc-secondary leading-relaxed bg-[#171923]/60 p-3 rounded-xl border border-white/5">
              Critical auth flows (Register, Password Reset, Password Update) enforce mandatory 6-digit cryptographic OTP tokens with a 10-minute TTL expiration cycle.
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
              <Zap className="w-4 h-4" />
              <span>3. Real-Time WebSocket Synchronization</span>
            </div>
            <p className="text-xs text-mc-secondary leading-relaxed bg-[#171923]/60 p-3 rounded-xl border border-white/5">
              State events (direct chats, channel posts, hand raises, emoji reactions, presence status) stream bi-directionally over secure WebSockets with automatic reconnection.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <Layers className="w-4 h-4" />
              <span>4. Enterprise Quietly Premium Theme System</span>
            </div>
            <p className="text-xs text-mc-secondary leading-relaxed bg-[#171923]/60 p-3 rounded-xl border border-white/5">
              Features dark and light themes using curated HSL color tokens, glassmorphism overlays, drag-and-drop popups, and high-contrast typography.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#171923] border-t border-white/5 text-center text-[10px] text-mc-muted">
          Micropro_Commute Architecture • Release Build v3.0 (Enterprise)
        </div>
      </div>
    </div>
  );
};
