import React, { useEffect, useState, useCallback } from 'react';
import { AppRail } from '../components/layout/AppRail';
import { TopHeader } from '../components/layout/TopHeader';
import { Sidebar } from '../components/layout/Sidebar';
import { DirectMessageSidebar } from '../components/chat/DirectMessageSidebar';
import { ChatArea } from '../components/chat/ChatArea';
import { DirectChatArea } from '../components/chat/DirectChatArea';
import { MeetingRoom } from '../components/meeting/MeetingRoom';
import { CalendarView } from '../components/calendar/CalendarView';
import { AdminConsole } from '../components/admin/AdminConsole';
import { CreateTeamModal } from '../components/modals/CreateTeamModal';
import { CreateChannelModal } from '../components/modals/CreateChannelModal';
import { UserSettingsModal } from '../components/modals/UserSettingsModal';
import { FullscreenCallOverlay } from '../components/call/FullscreenCallOverlay';
import { ToastContainer } from '../components/notifications/ToastContainer';
import { useUIStore } from '../stores/uiStore';
import { useCallStore } from '../stores/callStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { wsService } from '../services/websocketService';
import { Team } from '../types';
import { apiClient } from '../api/client';

export const Dashboard: React.FC = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  const { selectedTeam, setSelectedTeam, selectedChannel, setSelectedChannel, activeTab, setActiveTab } = useUIStore();
  const { receiveCall, acceptCall, declineCall, endCall, callState, conversationId } = useCallStore();
  const { incrementUnread, clearUnread, addToast } = useNotificationStore();

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
  }, []);

  // When user opens a conversation, clear its unread badge count
  useEffect(() => {
    if (activeTab === 'chat' && selectedConvId) {
      clearUnread(selectedConvId);
    }
  }, [activeTab, selectedConvId, clearUnread]);

  // Global WebSocket event router for Call & Message notifications
  const handleGlobalWSEvent = useCallback((event: any) => {
    if (event.type === 'call_invite') {
      // Auto-rejoin logic: If we are already actively in this conversation's call room,
      // silently auto-accept the invite so the other person can rejoin instantly!
      if ((callState === 'active' || callState === 'outgoing') && conversationId === event.conversation_id) {
        wsService.send({ type: 'call_response', target_user_id: event.sender_user_id, status: 'accepted' });
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
    } else if (event.type === 'call_response') {
      if (event.status === 'accepted') {
        acceptCall();
        addToast({ title: 'Call Connected', body: 'The call has been accepted.', type: 'call' });
      } else if (event.status === 'declined') {
        declineCall();
        addToast({ title: 'Call Declined', body: 'The call was declined.', type: 'call' });
      } else if (event.status === 'ended') {
        endCall();
        addToast({ title: 'Call Ended', body: 'The call session has ended.', type: 'call' });
      }
    } else if (event.type === 'direct_message.new' || event.type === 'message.new') {
      const msg = event.message || event;
      const convId = event.conversation_id || msg.conversation_id;
      
      if (activeTab !== 'chat' || selectedConvId !== convId) {
        if (convId) incrementUnread(convId);
        addToast({
          title: `New message from ${msg.sender?.display_name || 'Teammate'}`,
          body: msg.content || 'Sent an attachment',
          type: 'chat'
        });
      }
    }
  }, [activeTab, selectedConvId, receiveCall, acceptCall, declineCall, endCall, incrementUnread, addToast, callState, conversationId]);

  useWebSocket(undefined, handleGlobalWSEvent);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#181818]">
      {/* 1. Vertical App Rail */}
      <AppRail />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* 2. Top Header Bar */}
        <TopHeader />

        {/* 3. Content Workspace Split Pane */}
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
          ) : activeTab === 'calls' || activeTab === 'calendar' || activeTab === 'admin' ? null : (
            <Sidebar teams={teams} isLoading={isLoading} />
          )}

          {/* 3b. Main Work Area */}
          {activeTab === 'admin' ? (
            <AdminConsole />
          ) : activeTab === 'calendar' ? (
            <CalendarView onJoinMeeting={() => setActiveTab('calls')} />
          ) : activeTab === 'calls' ? (
            <MeetingRoom onLeave={() => setActiveTab('teams')} />
          ) : activeTab === 'chat' ? (
            <DirectChatArea conversationId={selectedConvId} />
          ) : activeTab === 'teams' ? (
            <ChatArea />
          ) : (
            <div className="flex-1 flex items-center justify-center text-teams-muted text-sm font-medium">
              <div className="text-center p-8 bg-[#1F1F1F] border border-teams-border rounded-xl max-w-sm">
                <h3 className="text-white font-bold mb-2 capitalize">{activeTab} Module</h3>
                <p className="text-xs">
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
      <FullscreenCallOverlay />
      <ToastContainer />
    </div>
  );
};
