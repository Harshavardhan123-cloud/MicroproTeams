import React, { useEffect, useState } from 'react';
import { Shield, Users, Layers, Activity, RefreshCw, ShieldCheck, BarChart3 } from 'lucide-react';
import { User, Team } from '../../types';
import { userService } from '../../services/userService';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { AuditViewer } from '../../features/admin/AuditViewer';
import { ComplianceDashboard } from '../../features/compliance/ComplianceDashboard';
import { AnalyticsDashboard } from '../../features/analytics/AnalyticsDashboard';

export const AdminConsole: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'teams' | 'audit' | 'compliance' | 'analytics'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadAdminData = async () => {
    try {
      setIsLoading(true);
      const [uRes, tRes] = await Promise.allSettled([
        userService.getUsers(),
        apiClient.get('/teams')
      ]);

      if (uRes.status === 'fulfilled') {
        const uData = uRes.value;
        setUsers(Array.isArray(uData) ? uData : (uData as any)?.data || []);
      }

      if (tRes.status === 'fulfilled') {
        const tData = tRes.value.data;
        setTeams(Array.isArray(tData) ? tData : tData?.data || []);
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
      u.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 bg-[#0B0D12] text-mc-text flex flex-col h-full overflow-hidden select-none">
      {/* Top Admin Header */}
      <div className="h-14 border-b border-white/5 bg-[#11131A] px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white font-display flex items-center gap-2">
              Enterprise Control Center
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30 uppercase">
                Admin Privileges Granted
              </span>
            </h1>
            <p className="text-[11px] text-mc-muted">Governance, Compliance & Performance Analytics</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-xl border border-white/10 flex items-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Sub Navigation Bar */}
      <div className="px-6 border-b border-white/5 bg-[#11131A] flex items-center gap-6 shrink-0">
        {[
          { id: 'users', label: 'User Directory', icon: Users },
          { id: 'teams', label: 'Teams & Workspaces', icon: Layers },
          { id: 'audit', label: 'Security Audit Logs', icon: Activity },
          { id: 'compliance', label: 'Compliance & Governance', icon: ShieldCheck },
          { id: 'analytics', label: 'Usage & Intelligence Analytics', icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                isActive
                  ? 'border-indigo-500 text-indigo-400 font-bold'
                  : 'border-transparent text-mc-muted hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden bg-[#0B0D12]">
        {activeTab === 'users' && (
          <div className="p-6 space-y-4 max-w-6xl mx-auto overflow-y-auto h-full text-xs">
            <div className="flex items-center justify-between">
              <input
                type="text"
                placeholder="Filter users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#171923] border border-white/10 rounded-xl px-4 py-2 text-white text-xs w-72 focus:outline-none focus:border-indigo-500 transition-all"
              />
              <span className="text-mc-muted text-xs">Showing {filteredUsers.length} organization members</span>
            </div>

            <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left">
                <thead className="bg-[#171923] text-mc-muted font-bold border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                            {u.display_name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-bold text-white font-display text-xs">{u.display_name}</p>
                            <p className="text-[11px] text-mc-muted">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 bg-indigo-600/20 text-indigo-300 text-[10px] font-bold rounded-full border border-indigo-500/20">
                          {u.email === 'admin@example.com' ? 'ORG ADMIN' : 'MEMBER'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-mc-muted text-xs">{u.department || 'Engineering'}</td>
                      <td className="py-3 px-4 text-emerald-400 font-semibold text-xs">Active</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="p-6 space-y-4 max-w-6xl mx-auto overflow-y-auto h-full text-xs">
            <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left">
                <thead className="bg-[#171923] text-mc-muted font-bold border-b border-white/5 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Team Name</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Privacy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {teams.map((t) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-400" />
                        <span className="font-display text-xs">{t.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-mc-muted text-xs">{t.description || 'Enterprise collaboration workspace.'}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-semibold text-indigo-300 uppercase">
                          {t.privacy || 'PUBLIC'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'audit' && <AuditViewer />}
        {activeTab === 'compliance' && <ComplianceDashboard />}
        {activeTab === 'analytics' && <AnalyticsDashboard />}
      </div>
    </div>
  );
};
