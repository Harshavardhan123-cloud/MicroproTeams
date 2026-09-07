import React, { useEffect } from 'react';
import { X, Command, Keyboard, Mic, Video, Search, MessageSquare, Settings, GripHorizontal } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useDraggable } from '../../hooks/useDraggable';

export const KeyboardShortcutsModal: React.FC = () => {
  const { isShortcutsOpen, setShortcutsOpen, setUserSettingsOpen, setNewChatOpen, setActiveTab } = useUIStore();
  const draggable = useDraggable();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global shortcut handling
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setNewChatOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setUserSettingsOpen(true);
      } else if (e.key === 'Escape') {
        setShortcutsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShortcutsOpen, setUserSettingsOpen, setNewChatOpen]);

  if (!isShortcutsOpen) return null;

  const shortcutGroups = [
    {
      category: 'Messaging & Chat (WhatsApp Style)',
      items: [
        { keys: ['Enter'], description: 'Send Message Immediately', action: null },
        { keys: ['Shift', 'Enter'], description: 'Insert Line Break in Textarea', action: null },
        { keys: ['↑ (Up Arrow)'], description: 'Edit Last Sent Message (when input is empty)', action: null },
        { keys: ['Ctrl', 'B'], description: 'Bold Text (**text**)', action: null },
        { keys: ['Ctrl', 'I'], description: 'Italic Text (*text*)', action: null },
        { keys: ['Ctrl', 'Shift', ']'], description: 'Navigate to Next Conversation', action: null },
        { keys: ['Ctrl', 'Shift', '['], description: 'Navigate to Previous Conversation', action: null },
      ]
    },
    {
      category: 'Navigation & Search',
      items: [
        { keys: ['Ctrl', 'E'], description: 'Focus Search Bar', action: () => { const el = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement; el?.focus(); } },
        { keys: ['⌘ / Ctrl', 'K'], description: 'Quick Search Workspace', action: () => { const el = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement; el?.focus(); } },
        { keys: ['Ctrl', 'N'], description: 'Create New Chat / Direct Message', action: () => setNewChatOpen(true) },
        { keys: ['Ctrl', ','], description: 'Open Profile & Workspace Settings', action: () => setUserSettingsOpen(true) },
        { keys: ['Ctrl', '/'], description: 'Toggle Hotkeys Cheat Sheet', action: () => setShortcutsOpen(!isShortcutsOpen) },
      ]
    },
    {
      category: 'App Rail View Shortcuts',
      items: [
        { keys: ['Alt', '1'], description: 'Activity Inbox', action: () => setActiveTab('activity') },
        { keys: ['Alt', '2'], description: 'Chats & Messages', action: () => setActiveTab('chat') },
        { keys: ['Alt', '3'], description: 'Channels & Teams', action: () => setActiveTab('teams') },
        { keys: ['Alt', '4'], description: 'Calendar & Schedules', action: () => setActiveTab('calendar') },
        { keys: ['Alt', '5'], description: 'Meetings & Calls', action: () => setActiveTab('calls') },
        { keys: ['Alt', '6'], description: 'Files Workspace', action: () => setActiveTab('files') },
      ]
    },
    {
      category: 'In-Call & Meeting Hotkeys',
      items: [
        { keys: ['Ctrl', 'Shift', 'M'], description: 'Toggle Microphone Mute / Unmute', action: null },
        { keys: ['Ctrl', 'Shift', 'V'], description: 'Toggle Camera Video On / Off', action: null },
        { keys: ['Ctrl', 'Shift', 'S'], description: 'Toggle Screen Share', action: null },
        { keys: ['Spacebar (Hold)'], description: 'Push-to-Talk (Temporary Unmute)', action: null },
        { keys: ['Esc'], description: 'Close Active Modals & Popovers', action: () => setShortcutsOpen(false) },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 select-none">
      <div 
        style={draggable.style}
        onMouseDown={draggable.handleDragStart}
        onTouchStart={draggable.handleDragStart}
        className={`bg-[#11131A] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 cursor-grab active:cursor-grabbing ${draggable.position ? 'fixed z-50' : 'relative'}`}
      >
        {/* Header */}
        <div className="p-4 bg-[#171923] border-b border-white/5 flex items-center justify-between cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2.5">
            <GripHorizontal className="w-4 h-4 text-mc-muted" />
            <Keyboard className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-bold text-sm text-white font-display">Keyboard Shortcuts & Commands</h3>
              <p className="text-[11px] text-mc-muted">Master platform productivity hotkeys</p>
            </div>
          </div>
          <button
            onClick={() => setShortcutsOpen(false)}
            className="p-1 rounded-lg hover:bg-white/10 text-mc-muted hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[480px] overflow-y-auto">
          {shortcutGroups.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                {group.category}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#171923]/60 hover:bg-[#171923] border border-white/5 transition-colors"
                  >
                    <span className="text-xs text-white font-medium">{item.description}</span>
                    <div className="flex items-center gap-1.5">
                      {item.keys.map((k, ki) => (
                        <kbd 
                          key={ki} 
                          className="px-2 py-1 rounded bg-[#0B0D12] border border-white/10 text-[10px] font-mono text-indigo-300 font-bold shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                      {item.action && (
                        <button
                          onClick={() => {
                            item.action?.();
                            setShortcutsOpen(false);
                          }}
                          className="ml-2 text-[10px] text-indigo-400 hover:underline font-semibold"
                        >
                          Try
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#171923] border-t border-white/5 text-center text-[10px] text-mc-muted">
          Press <kbd className="px-1.5 py-0.5 rounded bg-black/40 text-white font-mono">Esc</kbd> anywhere to dismiss modals.
        </div>
      </div>
    </div>
  );
};
