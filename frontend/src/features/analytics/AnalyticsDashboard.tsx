import React, { useEffect, useState } from 'react';
import { BarChart3, Video, Users, HardDrive, Download, TrendingUp, Mic, Monitor } from 'lucide-react';
import { adminService } from '../../services/adminService';

export const AnalyticsDashboard: React.FC = () => {
  const [overview, setOverview] = useState<any>(null);
  const [meetingStats, setMeetingStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [ov, ms] = await Promise.all([
          adminService.getAnalyticsOverview(),
          adminService.getMeetingAnalytics()
        ]);
        setOverview(ov);
        setMeetingStats(ms);
      } catch (err) {
        console.error('Fetch analytics stats error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleExport = async () => {
    try {
      await adminService.createExport('ALL');
      alert('Enterprise data export job queued successfully.');
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#181818] p-6 space-y-6 overflow-y-auto text-xs text-teams-text select-none">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teams-purple" />
            Organization & Meeting Analytics
          </h2>
          <p className="text-teams-muted text-xs">Real-time organizational performance and communication metrics</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-teams-purple hover:bg-teams-purple-hover text-white font-bold rounded-lg flex items-center gap-2 border border-teams-purple/40 shadow-lg"
        >
          <Download className="w-4 h-4" />
          <span>Export Enterprise Report</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-[#1F1F1F] border border-teams-border rounded-xl flex items-center gap-4">
          <div className="p-3 bg-teams-purple/20 text-teams-purple rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-teams-muted text-[11px]">Daily Active Users (DAU)</span>
            <div className="text-xl font-bold text-white mt-0.5">{overview?.active_users_dau || 0}</div>
          </div>
        </div>

        <div className="p-4 bg-[#1F1F1F] border border-teams-border rounded-xl flex items-center gap-4">
          <div className="p-3 bg-emerald-950/60 text-emerald-400 rounded-xl border border-emerald-800/40">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <span className="text-teams-muted text-[11px]">Meetings Conducted</span>
            <div className="text-xl font-bold text-white mt-0.5">{meetingStats?.total_meetings || 0}</div>
          </div>
        </div>

        <div className="p-4 bg-[#1F1F1F] border border-teams-border rounded-xl flex items-center gap-4">
          <div className="p-3 bg-indigo-950/60 text-indigo-400 rounded-xl border border-indigo-800/40">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <span className="text-teams-muted text-[11px]">Total Meeting Hours</span>
            <div className="text-xl font-bold text-white mt-0.5">{meetingStats?.total_meeting_hours || 0} hrs</div>
          </div>
        </div>

        <div className="p-4 bg-[#1F1F1F] border border-teams-border rounded-xl flex items-center gap-4">
          <div className="p-3 bg-cyan-950/60 text-cyan-400 rounded-xl border border-cyan-800/40">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <span className="text-teams-muted text-[11px]">Storage Allocated</span>
            <div className="text-xl font-bold text-white mt-0.5">150 MB</div>
          </div>
        </div>
      </div>

      {/* Feature Usage Breakdown */}
      <div className="p-5 bg-[#1F1F1F] border border-teams-border rounded-xl space-y-4">
        <h3 className="text-sm font-bold text-white">Media & Feature Adoption Rate</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-[#252424] border border-teams-border rounded-xl space-y-2">
            <div className="flex items-center justify-between text-teams-muted">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <Mic className="w-4 h-4 text-emerald-400" />
                Audio Calls
              </span>
              <span className="font-bold text-emerald-400">{meetingStats?.audio_usage_percent || 98}%</span>
            </div>
            <div className="w-full bg-[#181818] h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-400 h-full" style={{ width: `${meetingStats?.audio_usage_percent || 98}%` }}></div>
            </div>
          </div>

          <div className="p-4 bg-[#252424] border border-teams-border rounded-xl space-y-2">
            <div className="flex items-center justify-between text-teams-muted">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <Video className="w-4 h-4 text-teams-purple" />
                Video Streams
              </span>
              <span className="font-bold text-teams-purple">{meetingStats?.video_usage_percent || 82}%</span>
            </div>
            <div className="w-full bg-[#181818] h-2 rounded-full overflow-hidden">
              <div className="bg-teams-purple h-full" style={{ width: `${meetingStats?.video_usage_percent || 82}%` }}></div>
            </div>
          </div>

          <div className="p-4 bg-[#252424] border border-teams-border rounded-xl space-y-2">
            <div className="flex items-center justify-between text-teams-muted">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <Monitor className="w-4 h-4 text-amber-400" />
                Screen Sharing
              </span>
              <span className="font-bold text-amber-400">{meetingStats?.screen_share_usage_percent || 45}%</span>
            </div>
            <div className="w-full bg-[#181818] h-2 rounded-full overflow-hidden">
              <div className="bg-amber-400 h-full" style={{ width: `${meetingStats?.screen_share_usage_percent || 45}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
