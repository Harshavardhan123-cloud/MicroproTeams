import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Video, Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useCallStore } from '../stores/callStore';

export const MeetingLinkHandler: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'joining' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [meetingDetails, setMeetingDetails] = useState<any | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!isAuthenticated) {
      if (code) {
        sessionStorage.setItem('mc_redirect_url', `/meet/${code}`);
      }
      navigate('/login', { replace: true });
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMessage('No meeting code provided in URL.');
      return;
    }

    // Resolve meeting by code
    const resolveMeeting = async () => {
      try {
        setStatus('loading');
        const res = await apiClient.get(`/meetings/code/${encodeURIComponent(code)}`);
        const meeting = res.data?.data || res.data;

        if (!meeting || !meeting.id) {
          throw new Error('Meeting not found or has expired.');
        }

        setMeetingDetails(meeting);
        setStatus('joining');

        // Prepare stores and transition directly to meeting room
        useUIStore.setState({
          activeTab: 'calls',
          activeMeetingId: meeting.id,
          isMeetingPoppedOut: false
        });

        useCallStore.setState({
          callState: 'active',
          callType: 'video',
          caller: {
            id: meeting.host?.id || 'host',
            name: meeting.host?.display_name || 'Host',
            avatar: meeting.host?.avatar_url
          },
          recipient: null,
          conversationId: meeting.id,
          callId: meeting.id,
          isGroupCall: true,
          isCaller: user?.id === meeting.host?.id,
          isCallMinimized: false,
          canRejoin: false
        });

        // Navigate to workspace dashboard
        navigate('/app/teams', { replace: true });
      } catch (err: any) {
        console.error('Failed to resolve meeting by code:', err);
        setStatus('error');
        setErrorMessage(
          err.response?.data?.message ||
          err.response?.data?.detail ||
          'This meeting link is invalid, expired, or belongs to another organization.'
        );
      }
    };

    resolveMeeting();
  }, [code, isAuthenticated, isAuthLoading, navigate, user?.id]);

  return (
    <div className="min-h-screen bg-[#08090D] flex items-center justify-center p-6 text-white select-none font-sans">
      <div className="bg-[#0E1017] border border-white/[0.08] rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 relative overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex items-center justify-center mx-auto shadow-xl shadow-indigo-600/30">
          <Video className="w-8 h-8 text-white" />
        </div>

        {status === 'loading' || status === 'joining' ? (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-white font-display">Connecting to Meeting</h2>
            <p className="text-xs text-slate-400">
              Verifying meeting code <span className="font-mono text-indigo-400 font-bold">{code}</span> and joining secure media session...
            </p>
            <div className="flex items-center justify-center gap-2 pt-4 text-indigo-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs font-semibold">Joining session...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-display">Unable to Join Meeting</h2>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{errorMessage}</p>
            </div>
            <button
              onClick={() => navigate('/app/teams', { replace: true })}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <span>Return to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="pt-2 border-t border-white/[0.05] flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>Micropro Commute High-Definition Encrypted SFU</span>
        </div>
      </div>
    </div>
  );
};
