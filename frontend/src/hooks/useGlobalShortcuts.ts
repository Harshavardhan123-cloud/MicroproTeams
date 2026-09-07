import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useCallStore } from '../stores/callStore';

/**
 * Global WhatsApp & Teams-style Keyboard Hotkey Orchestrator
 * Supports complete keyboard navigation across chats, search, call controls, and modals.
 */
export const useGlobalShortcuts = (
  onNavigateNextChat?: () => void,
  onNavigatePrevChat?: () => void
) => {
  const {
    isShortcutsOpen, setShortcutsOpen,
    isUserSettingsOpen, setUserSettingsOpen,
    isNewChatOpen, setNewChatOpen,
    isCreateTeamOpen, setCreateTeamOpen,
    isCreateChannelOpen, setCreateChannelOpen,
    isDocsOpen, setDocsOpen,
    isAboutOpen, setAboutOpen,
    setActiveTab, activeTab
  } = useUIStore();

  const {
    callState,
    toggleMute,
    toggleVideo,
    isMuted
  } = useCallStore();

  useEffect(() => {
    let spaceBarHoldUnmute = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      const key = e.key.toLowerCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // -----------------------------------------------------------------
      // 1. UNIVERSAL ESCAPE KEY (Close open modals, cancel search/inputs)
      // -----------------------------------------------------------------
      if (e.key === 'Escape') {
        let handeled = false;
        if (isShortcutsOpen) { setShortcutsOpen(false); handeled = true; }
        if (isUserSettingsOpen) { setUserSettingsOpen(false); handeled = true; }
        if (isNewChatOpen) { setNewChatOpen(false); handeled = true; }
        if (isCreateTeamOpen) { setCreateTeamOpen(false); handeled = true; }
        if (isCreateChannelOpen) { setCreateChannelOpen(false); handeled = true; }
        if (isDocsOpen) { setDocsOpen(false); handeled = true; }
        if (isAboutOpen) { setAboutOpen(false); handeled = true; }

        if (!handeled && isInputFocused) {
          (activeEl as HTMLElement).blur();
        }
        return;
      }

      // -----------------------------------------------------------------
      // 2. GLOBAL SHORTCUTS MODAL (Ctrl+/ or Cmd+/ or Shift+?)
      // -----------------------------------------------------------------
      if ((isCtrlOrCmd && (key === '/' || key === '?')) || (e.shiftKey && key === '?')) {
        if (!isInputFocused || isCtrlOrCmd) {
          e.preventDefault();
          setShortcutsOpen(!isShortcutsOpen);
          return;
        }
      }

      // -----------------------------------------------------------------
      // 3. SEARCH WORKSPACE (Ctrl+E or Cmd+E or Ctrl+K or Cmd+K)
      // -----------------------------------------------------------------
      if (isCtrlOrCmd && (key === 'e' || key === 'k')) {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // -----------------------------------------------------------------
      // 4. NEW CHAT / DIRECT MESSAGE (Ctrl+N or Cmd+N)
      // -----------------------------------------------------------------
      if (isCtrlOrCmd && key === 'n') {
        e.preventDefault();
        setNewChatOpen(true);
        return;
      }

      // -----------------------------------------------------------------
      // 5. OPEN USER SETTINGS (Ctrl+, or Cmd+,)
      // -----------------------------------------------------------------
      if (isCtrlOrCmd && e.key === ',') {
        e.preventDefault();
        setUserSettingsOpen(true);
        return;
      }

      // -----------------------------------------------------------------
      // 6. APP RAIL TAB NAVIGATION (Alt + 1 .. 6)
      // -----------------------------------------------------------------
      if (e.altKey && !isCtrlOrCmd) {
        if (key === '1') { e.preventDefault(); setActiveTab('activity'); return; }
        if (key === '2') { e.preventDefault(); setActiveTab('chat'); return; }
        if (key === '3') { e.preventDefault(); setActiveTab('teams'); return; }
        if (key === '4') { e.preventDefault(); setActiveTab('calendar'); return; }
        if (key === '5') { e.preventDefault(); setActiveTab('calls'); return; }
        if (key === '6') { e.preventDefault(); setActiveTab('files'); return; }
      }

      // -----------------------------------------------------------------
      // 7. CHAT SIDEBAR NAVIGATION (Ctrl+Shift+] / Ctrl+Shift+[ or Alt+Down / Alt+Up)
      // -----------------------------------------------------------------
      if ((isCtrlOrCmd && e.shiftKey && (e.key === ']' || e.key === '}')) || (e.altKey && e.key === 'ArrowDown')) {
        e.preventDefault();
        if (onNavigateNextChat) onNavigateNextChat();
        return;
      }

      if ((isCtrlOrCmd && e.shiftKey && (e.key === '[' || e.key === '{')) || (e.altKey && e.key === 'ArrowUp')) {
        e.preventDefault();
        if (onNavigatePrevChat) onNavigatePrevChat();
        return;
      }

      // -----------------------------------------------------------------
      // 8. IN-CALL KEYBOARD HOTKEYS (Mute, Video, Push-To-Talk)
      // -----------------------------------------------------------------
      if (callState === 'active') {
        // Ctrl+Shift+M or M (when not typing in text field) -> Toggle Mic
        if ((isCtrlOrCmd && e.shiftKey && key === 'm') || (!isInputFocused && key === 'm')) {
          e.preventDefault();
          toggleMute();
          return;
        }

        // Ctrl+Shift+V or V (when not typing in text field) -> Toggle Video
        if ((isCtrlOrCmd && e.shiftKey && key === 'v') || (!isInputFocused && key === 'v')) {
          e.preventDefault();
          toggleVideo();
          return;
        }

        // Push-to-Talk via Spacebar (unmute while holding spacebar when focused outside inputs)
        if (e.code === 'Space' && !isInputFocused && !e.repeat && isMuted) {
          e.preventDefault();
          spaceBarHoldUnmute = true;
          toggleMute(); // Unmute
          return;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release Push-to-Talk spacebar
      if (e.code === 'Space' && spaceBarHoldUnmute && callState === 'active') {
        spaceBarHoldUnmute = false;
        toggleMute(); // Mute again
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isShortcutsOpen, setShortcutsOpen,
    isUserSettingsOpen, setUserSettingsOpen,
    isNewChatOpen, setNewChatOpen,
    isCreateTeamOpen, setCreateTeamOpen,
    isCreateChannelOpen, setCreateChannelOpen,
    isDocsOpen, setDocsOpen,
    isAboutOpen, setAboutOpen,
    setActiveTab, activeTab,
    callState, toggleMute, toggleVideo, isMuted,
    onNavigateNextChat, onNavigatePrevChat
  ]);
};
