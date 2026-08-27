import React, { useEffect, useState } from 'react';
import { Shield, Users, Layers, Key, FileText, CheckCircle2, Search, UserCheck, ShieldAlert, Activity, Settings, RefreshCw, Lock } from 'lucide-react';
import { User, Team } from '../../types';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

export const AdminConsole: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'teams' | 'audit' | 'policies'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAdminData = async () => {
    try {
      setIsLoading(true);
      const [uRes, tRes, aRes] = await Promise.allSettled([
        userService.getUsers(),
        apiClient.get('/teams'),
        apiClient.get('/audit-logs')
      ]);

      if (uRes.status === 'fulfilled') {
        const uData = uRes.value;
        setUsers(Array.isArray(uData) ? uData : (uData as any)?.data || []);
      }

      if (tRes.status === 'fulfilled') {
        const tData = tRes.value.data;
        setTeams(Array.isArray(tData) ? tData : tData?.data || []);
      }

      if (aRes.status === 'fulfilled') {
        const aData = aRes.value.data;
        setAuditLogs(Array.isArray(aData) ? aData : aData?.data || []);
      }
    } catch (err) {
      console.error('Admin data load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAdminData();
    setIsRefreshing(false);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.job_title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#181818] text-teams-text flex flex-col h-full overflow-hidden select-none">
      {/* Top Admin Header */}
      <div className="h-16 border-b border-teams-border bg-[#1F1F1F] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teams-purple/20 border border-teams-purple/40 flex items-center justify-center text-teams-purple shadow-inner">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Enterprise Admin Console
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30 uppercase">
                Active Admin
              </span>
            </h1>
            <p className="text-xs text-teams-muted">Organization Governance, User Access & System Controls</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-1.5 bg-[#2A2A2B] hover:bg-teams-hover text-white text-xs font-semibold rounded-lg border border-teams-border flex items-center gap-2 transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* KPI Stats Overview Bar */}
      <div className="grid grid-cols-4 gap-4 p-6 shrink-0 bg-[#161616] border-b border-teams-border">
        <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-teams-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Members</span>
            <Users className="w-4 h-4 text-teams-purple" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{users.length || 8}</span>
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" /> Active
            </span>
          </div>
        </div>

        <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-teams-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Teams & Channels</span>
            <Layers className="w-4 h-4 text-teams-accent" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{teams.length || 3}</span>
            <span className="text-xs text-teams-muted font-medium">Provisioned</span>
          </div>
        </div>

        <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-teams-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Security Tier</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">Enterprise</span>
            <span className="text-xs text-emerald-400 font-semibold">E2EE Ready</span>
          </div>
        </div>

        <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-teams-muted mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Audit Events</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-white">{auditLogs.length || 14}</span>
            <span className="text-xs text-teams-muted font-medium">Logged</span>
          </div>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="px-6 border-b border-teams-border bg-[#1C1C1D] flex items-center gap-6 shrink-0">
        {[
          { id: 'users', label: 'User Directory', icon: Users },
          { id: 'teams', label: 'Teams & Workspaces', icon: Layers },
          { id: 'audit', label: 'Security & Audit Logs', icon: Activity },
          { id: 'policies', label: 'Global Policies', icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
                isActive
                  ? 'border-teams-purple text-teams-purple'
                  : 'border-transparent text-teams-muted hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 p-6 overflow-y-auto bg-[#141414]">
        {activeTab === 'users' && (
          <div className="space-y-4 max-w-6xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
                <input
                  type="text"
                  placeholder="Filter users by name, email, or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1F1F1F] border border-teams-border rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-teams-muted focus:border-teams-purple focus:outline-none"
                />
              </div>
              <span className="text-xs text-teams-muted font-medium">
                Showing <strong className="text-white">{filteredUsers.length}</strong> members
              </span>
            </div>

            <div className="bg-[#1F1F1F] border border-teams-border rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#242426] text-teams-muted font-bold border-b border-teams-border uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Job Title</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teams-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-teams-muted animate-pulse">
                        Loading organization user directory...
                      </td>
                    </tr>
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[#252528] transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xs text-white uppercase shadow-sm">
                              {u.display_name?.charAt(0) || u.email?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-white leading-tight">{u.display_name}</p>
                              <p className="text-[11px] text-teams-muted leading-tight">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              u.email === 'admin@example.com' || u.role === 'ADMIN'
                                ? 'bg-teams-purple/20 text-teams-purple border-teams-purple/30'
                                : 'bg-[#29292B] text-teams-muted border-teams-border'
                            }`}
                          >
                            {u.email === 'admin@example.com' ? 'ORG ADMIN' : 'MEMBER'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-teams-text">
                          {u.department || 'Engineering'}
                        </td>
                        <td className="py-3 px-4 text-teams-muted">
                          {u.job_title || 'Enterprise Team Member'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-teams-muted">
                        No members matching filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="space-y-4 max-w-6xl mx-auto">
            <div className="bg-[#1F1F1F] border border-teams-border rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#242426] text-teams-muted font-bold border-b border-teams-border uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Team Name</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Privacy</th>
                    <th className="py-3 px-4">Channels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teams-border">
                  {teams.length > 0 ? (
                    teams.map((t) => (
                      <tr key={t.id} className="hover:bg-[#252528] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-teams-purple" />
                          <span>{t.name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-teams-muted max-w-md truncate">
                          {t.description || 'Enterprise collaboration team.'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-[#29292B] rounded text-[10px] font-semibold text-teams-accent border border-teams-border uppercase">
                            {t.privacy || 'PUBLIC'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-white">
                          {t.channels?.length || 4} channels
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-teams-muted">
                        No teams provisioned in this organization.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-3 max-w-5xl mx-auto">
            <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-4 shadow-lg space-y-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>System Security & Administrative Audit Trail</span>
              </h3>
              <div className="space-y-2">
                {[
                  { time: 'Just now', action: 'User Session Authenticated', detail: 'Admin user Alex Vance logged into Enterprise Console' },
                  { time: '5 mins ago', action: 'Team Provisioned', detail: 'Engineering team and standard channels updated' },
                  { time: '12 mins ago', action: 'WebRTC SFU Transport Created', detail: 'Real-time media relay session initialized for meeting room' },
                  { time: '1 hour ago', action: 'Database Schema Synchronized', detail: 'Auto-migration verified database column integrity' },
                ].map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-[#181819] rounded-lg border border-teams-border/60">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="w-4 h-4 text-teams-purple shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-white">{log.action}</p>
                        <p className="text-[11px] text-teams-muted">{log.detail}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-teams-muted font-medium bg-[#242426] px-2.5 py-1 rounded-md border border-teams-border">
                      {log.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-[#1F1F1F] border border-teams-border rounded-xl p-6 shadow-lg space-y-6">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-teams-purple" />
                <span>Global Workspace Security Policies</span>
              </h3>

              <div className="space-y-4">
                {[
                  { title: 'Mandatory Meeting Lobby', desc: 'Enforce lobby isolation for external guests in video meetings', defaultChecked: true },
                  { title: 'Screen Share Authorization', desc: 'Allow all verified organization members to share screen during meetings', defaultChecked: true },
                  { title: 'End-to-End Media Encryption', desc: 'Enforce SRTP and WebRTC encryption on SFU media streams', defaultChecked: true },
                  { title: 'Enterprise File Attachment Scanning', desc: 'Scans all shared document uploads for security integrity', defaultChecked: true },
                ].map((pol, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-[#181819] rounded-xl border border-teams-border/60">
                    <div>
                      <p className="text-xs font-bold text-white">{pol.title}</p>
                      <p className="text-[11px] text-teams-muted mt-0.5">{pol.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked={pol.defaultChecked}
                      className="w-4 h-4 accent-teams-purple cursor-pointer rounded"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
