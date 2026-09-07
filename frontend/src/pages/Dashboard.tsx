import React, { useEffect, useState, useCallback } from 'react';
import { AppRail } from '../components/layout/AppRail';
import { TopHeader } from '../components/layout/TopHeader';
import { Sidebar } from '../components/layout/Sidebar';
import { DirectMessageSidebar } from '../components/chat/DirectMessageSidebar';
import { ChatArea } from '../components/chat/ChatArea';
import { DirectChatArea } from '../components/chat/DirectChatArea';
import { MeetingRoom } from '../components/meeting/MeetingRoom';
import { CallsHome } from '../components/meeting/CallsHome';
import { CalendarView } from '../components/calendar/CalendarView';
import { AdminConsole } from '../components/admin/AdminConsole';
import { FilesWorkspace } from '../features/files/FilesWorkspace';
import { ActivityFeedWorkspace } from '../features/activity/ActivityFeedWorkspace';
import { ContactsWorkspace } from '../features/contacts/ContactsWorkspace';
import { ContactsSidebar } from '../features/contacts/ContactsSidebar';
import { CreateTeamModal } from '../components/modals/CreateTeamModal';
import { CreateChannelModal } from '../components/modals/CreateChannelModal';
import { UserSettingsModal } from '../components/modals/UserSettingsModal';
import { KeyboardShortcutsModal } from '../components/modals/KeyboardShortcutsModal';
import { DocumentationModal } from '../components/modals/DocumentationModal';
import { AboutModal } from '../components/modals/AboutModal';
import { FullscreenCallOverlay } from '../components/call/FullscreenCallOverlay';
import { PopoutChatWindow } from '../components/chat/PopoutChatWindow';
import { ToastContainer } from '../components/notifications/ToastContainer';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useCallStore } from '../stores/callStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { wsService } from '../services/websocketService';
import { Team } from '../types';
import { apiClient } from '../api/client';
import { electronNotify, listenForUpdates } from '../services/electronNotificationService';
import { notificationManager } from '../utils/notificationManager';
import { ringtoneManager } from '../utils/ringtoneManager';
import { notificationOrchestrator } from '../services/notificationOrchestrator';
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts';

export const Dashboard: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [contactsFilter, setContactsFilter] = useState<'all' | 'favorites' | 'online' | 'blocked'>('all');
  const [contactsSearch, setContactsSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const { 
    selectedTeam, setSelectedTeam, 
    selectedChannel, setSelectedChannel, 
    activeTab, setActiveTab,
    activeMeetingId, setActiveMeetingId,
    isMeetingPoppedOut, setIsMeetingPoppedOut
  } = useUIStore();
  const { receiveCall, acceptCall, declineCall, endCall, callState, conversationId } = useCallStore();
  const { incrementUnread, clearUnread, addToast } = useNotificationStore();

  // Activate WhatsApp & Teams global keyboard hotkeys orchestrator
  useGlobalShortcuts();

  const fetchTeams = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.get('/teams');
      const teamData = Array.isArray(res.data) ? res.data : res.data.data || [];
      setTeams(teamData);
      if (teamData.length > 0) {
        if (!selectedTeam) {
          const firstTeam = teamData[0];
          setSelectedTeam(firstTeam);
          if (firstTeam.channels && firstTeam.channels.length > 0 && !selectedChannel) {
            setSelectedChannel(firstTeam.channels[0]);
          }
        }
      }
    } catch (err) {
      console.error('Fetch teams error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
    notificationManager.requestPermission();
  }, []);

  // When user opens a conversation, clear its unread badge count
  useEffect(() => {
    if (activeTab === 'chat' && selectedConvId) {
      clearUnread(selectedConvId);
    }
  }, [activeTab, selectedConvId, clearUnread]);

  // Register Electron OTA auto-update listeners for Windows EXE / Desktop
  useEffect(() => {
    if (!electronNotify.isElectron) return;

    // Trigger update check on mount
    electronNotify.checkForUpdate();

    const cleanup = listenForUpdates({
      onUpdateAvailable: (info) => {
        addToast({
          title: '🚀 OTA Update Available',
          body: `MicroproTeams Version ${info.version} is downloading in the background...`,
          type: 'info'
        });
      },
      onUpdateDownloaded: (info) => {
        addToast({
          title: '✅ OTA Update Ready to Install',
          body: `Version ${info.version} downloaded. Restart MicroproTeams to apply the update.`,
          type: 'info'
        });
      }
    });

    return () => {
      cleanup();
    };
  }, [addToast]);

  // Auto Pop-Out Meeting if user navigates away from calls tab
  useEffect(() => {
    if (activeTab !== 'calls' && activeMeetingId && !isMeetingPoppedOut) {
      setIsMeetingPoppedOut(true);
    }
  }, [activeTab, activeMeetingId, isMeetingPoppedOut, setIsMeetingPoppedOut]);

  // Global WebSocket event router for Call & Message notifications
  const handleGlobalWSEvent = useCallback((event: any) => {
    if (event.type === 'call_invite') {
      const loggedInUser = useAuthStore.getState().user;
      // Ignore call_invite sent by ourselves
      if (event.sender_user_id && loggedInUser?.id && String(event.sender_user_id) === String(loggedInUser.id)) {
        return;
      }

      // Auto-rejoin logic: If we are already actively in this conversation's call room,
      // silently auto-accept the invite so the other person can rejoin instantly!
      if ((callState === 'active' || callState === 'outgoing') && conversationId === event.conversation_id) {
        wsService.send({ type: 'call_response', target_user_id: event.sender_user_id, status: 'accepted' });
        return;
      }

      // Single meeting per user restriction: If already in another active meeting, decline with 'busy' status
      if (callState !== 'idle' && conversationId !== event.conversation_id) {
        wsService.send({ type: 'call_response', target_user_id: event.sender_user_id, status: 'busy' });
        addToast({
          title: 'Incoming Call Declined',
          body: `Missed call from ${event.caller_name || 'Teammate'} (You are in another meeting)`,
          type: 'call'
        });
        return;
      }

      receiveCall(
        {
          id: event.sender_user_id,
          name: event.caller_name || 'Teammate',
          avatar: event.caller_avatar
        },
        event.call_type || 'video',
        event.conversation_id,
        event.is_group_call || false
      );
      addToast({
        title: `Incoming ${event.is_group_call ? 'Group' : '1-on-1'} Call`,
        body: `${event.caller_name || 'A teammate'} is calling you.`,
        type: 'call'
      });

      // Trigger audio ringtone & browser/desktop notification
      ringtoneManager.play(event.call_type || 'video');
      notificationManager.showCallNotification({
        callId: event.conversation_id || `call-${Date.now()}`,
        callerName: event.caller_name || 'Teammate',
        callerAvatar: event.caller_avatar,
        isVideo: event.call_type === 'video',
        onNotificationClick: () => {
          window.focus();
        }
      });
    } else if (event.type === 'call_response') {
      ringtoneManager.stop();
      notificationManager.closeAllNotifications();
      if (event.status === 'accepted') {
        acceptCall();
        addToast({ title: 'Call Connected', body: 'The call has been accepted.', type: 'call' });
      } else if (event.status === 'declined') {
        declineCall();
        addToast({ title: 'Call Declined', body: 'The call was declined.', type: 'call' });
      } else if (event.status === 'busy') {
        declineCall();
        addToast({ title: 'User Busy', body: 'The user is currently attending another meeting.', type: 'call' });
      } else if (event.status === 'ended') {
        endCall();
        addToast({ title: 'Call Ended', body: 'The call session has ended.', type: 'call' });
      }
    } else if (event.type === 'meeting.started') {
      notificationOrchestrator.notify({
        notificationId: `mtg-start-${Date.now()}`,
        type: 'MEETING_STARTED',
        priority: 'HIGH',
        title: `📹 Meeting Started: ${event.title || 'Meeting'}`,
        body: event.body || `${event.host_name || 'Host'} has started the meeting.`
      });
    } else if (event.type === 'meeting.scheduled') {
      notificationOrchestrator.notify({
        notificationId: `mtg-sched-${Date.now()}`,
        type: 'MEETING_INVITATION',
        priority: 'HIGH',
        title: event.title || `📅 New Meeting Scheduled`,
        body: event.body || `You were invited to a meeting.`
      });
    } else if (event.type === 'notification.new' && event.notification) {
      notificationOrchestrator.notify({
        notificationId: event.notification.id || `sys-${Date.now()}`,
        type: (event.notification.type as any) || 'SYSTEM',
        priority: (event.notification.priority as any) || 'NORMAL',
        title: event.notification.title || 'New Notification',
        body: event.notification.body || ''
      });
    } else if (event.type === 'meeting.reminder_5m') {
      notificationOrchestrator.notify({
        notificationId: `mtg-rem-${Date.now()}`,
        type: 'MEETING_INVITATION',
        priority: 'HIGH',
        title: `⏰ Upcoming Meeting (5 mins)`,
        body: event.body || `'${event.title}' begins in 5 minutes.`
      });
    } else if (event.type === 'direct_message.new' || event.type === 'message.new') {
      const msg = event.message || event;
      const convId = event.conversation_id || msg.conversation_id;
      const loggedInUser = useAuthStore.getState().user;

      // Don't notify for messages sent by ourselves
      if (msg.sender_id && loggedInUser?.id && String(msg.sender_id) === String(loggedInUser.id)) {
        return;
      }
      if (msg.sender?.id && loggedInUser?.id && String(msg.sender.id) === String(loggedInUser.id)) {
        return;
      }

      ringtoneManager.playMessageSound();
      notificationManager.showMessageNotification({
        messageId: msg.id,
        senderName: msg.sender?.display_name || msg.sender_name || 'Teammate',
        senderAvatar: msg.sender?.avatar_url || msg.sender_avatar,
        content: msg.content || 'Sent an attachment',
        conversationId: convId,
        onNotificationClick: () => {
          window.focus();
          setActiveTab('chat');
          if (convId) setSelectedConvId(convId);
        }
      });
      
      if (activeTab !== 'chat' || selectedConvId !== convId) {
        if (convId) incrementUnread(convId);
        addToast({
          title: `New message from ${msg.sender?.display_name || msg.sender_name || 'Teammate'}`,
          body: msg.content || 'Sent an attachment',
          type: 'chat'
        });
      }
    }
  }, [activeTab, selectedConvId, receiveCall, acceptCall, declineCall, endCall, incrementUnread, addToast, callState, conversationId]);

  useWebSocket(undefined, handleGlobalWSEvent);

  // Listen to Electron background notification IPC actions (Answer/Decline/Reply)
  useEffect(() => {
    electronNotify.onCallAnswered(() => {
      acceptCall();
      setActiveTab('calls');
    });

    electronNotify.onCallDeclined(() => {
      declineCall();
    });

    electronNotify.onMessageReplied(({ conversationId, text, openApp }) => {
      if (openApp) {
        setActiveTab('chat');
        setSelectedConvId(conversationId);
      }
      if (text && conversationId) {
        apiClient.post(`/direct-conversations/${conversationId}/messages`, { content: text }).catch(console.error);
      }
    });

    return () => {
      electronNotify.cleanup('call-answered');
      electronNotify.cleanup('call-declined');
      electronNotify.cleanup('message-replied');
    };
  }, [acceptCall, declineCall, setActiveTab, setSelectedConvId]);

  // Handle browser & Service Worker notification click navigation (focus existing tab, open chat/call)
  useEffect(() => {
    // 1. Service Worker postMessage handler
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
        const { conversationId, callId } = event.data;
        if (conversationId) {
          setActiveTab('chat');
          setSelectedConvId(conversationId);
        } else if (callId) {
          setActiveTab('calls');
        } else {
          setActiveTab('chat');
        }
      }
    };

    // 2. Custom DOM navigate handler
    const handleNavEvent = (event: any) => {
      const detail = event.detail || {};
      if (detail.conversationId) {
        setActiveTab('chat');
        setSelectedConvId(detail.conversationId);
      } else if (detail.callId) {
        setActiveTab('calls');
      } else {
        setActiveTab('chat');
      }
    };

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }
    window.addEventListener('mc_notification_navigate', handleNavEvent);

    return () => {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
      window.removeEventListener('mc_notification_navigate', handleNavEvent);
    };
  }, [setActiveTab, setSelectedConvId]);

  // Pre-meeting 5-minute reminder background loop
  const [notified5m] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const checkScheduledReminders = async () => {
      try {
        const res = await apiClient.get('/calendar/events');
        const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
        const now = Date.now();
        list.forEach((evt: any) => {
          if (!evt.scheduled_start || notified5m.has(evt.id)) return;
          const sTime = new Date(evt.scheduled_start.endsWith('Z') || evt.scheduled_start.includes('+') ? evt.scheduled_start : evt.scheduled_start + 'Z').getTime();
          const diffMs = sTime - now;
          if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
            notified5m.add(evt.id);
            apiClient.post(`/calendar/events/${evt.id}/notify_reminder_5m`).catch(() => {});
            addToast({
              title: `Upcoming Meeting (5 mins)`,
              body: `"${evt.title}" hosted by ${evt.host?.display_name || 'Organizer'} starts in 5 minutes.`,
              type: 'info'
            });
          }
        });
      } catch {
        // background poll fail fallback
      }
    };

    checkScheduledReminders();
    const interval = setInterval(checkScheduledReminders, 30000);
    return () => clearInterval(interval);
  }, [addToast, notified5m]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0D12]">
      {/* 1. Vertical App Rail */}
      <AppRail />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top Header with Profile & Status */}
        <TopHeader />

        {/* Content Workspace Split Pane */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* 3a. Conditional Navigation Sidebar */}
          {activeTab === 'chat' ? (
            <DirectMessageSidebar
              selectedConvId={selectedConvId}
              onSelectConversation={(convId) => {
                setSelectedConvId(convId);
                clearUnread(convId);
              }}
            />
          ) : activeTab === 'calls' || activeTab === 'calendar' || activeTab === 'admin' || activeTab === 'files' || activeTab === 'activity' || activeTab === 'contacts' ? null : (
            <Sidebar teams={teams} isLoading={isLoading} />
          )}

          {/* 3b. Main Work Area */}
          {activeTab === 'admin' ? (
            <AdminConsole />
          ) : activeTab === 'files' ? (
            <FilesWorkspace />
          ) : activeTab === 'activity' ? (
            <ActivityFeedWorkspace />
          ) : activeTab === 'contacts' ? (
            <ContactsWorkspace />
          ) : activeTab === 'calendar' ? (
            <CalendarView
              onJoinMeeting={(meetingId) => {
                const currentActiveMeeting = useUIStore.getState().activeMeetingId;
                if ((callState !== 'idle' || currentActiveMeeting) && currentActiveMeeting !== meetingId) {
                  alert('⚠️ You can only attend one meeting at a time. Please leave your current meeting before joining another.');
                  return;
                }
                setActiveMeetingId(meetingId);
                setIsMeetingPoppedOut(false);
                setActiveTab('calls');
              }}
            />
          ) : activeTab === 'calls' ? (
            (activeMeetingId && !isMeetingPoppedOut) ? (
              <MeetingRoom
                meetingId={activeMeetingId}
                onLeave={() => setActiveMeetingId(null)}
                onPopOut={() => setIsMeetingPoppedOut(true)}
              />
            ) : (
              <CallsHome onMeetingStarted={(meetingId) => {
                setActiveMeetingId(meetingId);
                setIsMeetingPoppedOut(false);
              }} />
            )
          ) : activeTab === 'chat' ? (
            <DirectChatArea conversationId={selectedConvId} />
          ) : activeTab === 'teams' ? (
            <ChatArea />
          ) : (
            <div className="flex-1 flex items-center justify-center text-mc-muted text-sm font-medium">
              <div className="text-center p-8 bg-[#11131A] border border-white/10 rounded-2xl max-w-sm">
                <h3 className="text-white font-bold mb-2 capitalize font-display">{activeTab} Module</h3>
                <p className="text-xs text-mc-secondary">
                  The {activeTab} workspace is actively configured for your organization profile.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals & Overlays */}
      <CreateTeamModal onSuccess={fetchTeams} />
      <CreateChannelModal onSuccess={fetchTeams} />
      <UserSettingsModal />
      <KeyboardShortcutsModal />
      <DocumentationModal />
      <AboutModal />
      <FullscreenCallOverlay />
      <ToastContainer />
      <PopoutChatWindow />

      {/* Popped Out Meeting Room */}
      {activeMeetingId && isMeetingPoppedOut && (
        <div className="fixed bottom-6 right-6 w-96 h-64 z-[9999] shadow-2xl shadow-indigo-600/30 rounded-2xl overflow-hidden border-2 border-indigo-500 animate-in slide-in-from-bottom-5 fade-in duration-300 flex flex-col mc-glass">
          <MeetingRoom
            meetingId={activeMeetingId}
            onLeave={() => setActiveMeetingId(null)}
            isPoppedOut={true}
            onRestore={() => {
              setIsMeetingPoppedOut(false);
              setActiveTab('calls');
            }}
          />
        </div>
      )}
    </div>
  );
};
