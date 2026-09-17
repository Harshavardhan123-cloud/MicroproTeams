import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Trash2, Plus, AlertCircle, FileText } from 'lucide-react';
import { adminService } from '../../services/adminService';

export const ComplianceDashboard: React.FC = () => {
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [legalHolds, setLegalHolds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Legal Hold Form
  const [holdResourceType, setHoldResourceType] = useState('RECORDINGS');
  const [holdResourceId, setHoldResourceId] = useState('');
  const [holdReason, setHoldReason] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [rPolicies, lHolds] = await Promise.all([
        adminService.getRetentionPolicies(),
        adminService.getLegalHolds()
      ]);
      setRetentionPolicies(rPolicies);
      setLegalHolds(lHolds);
    } catch (err) {
      console.error('Error loading compliance data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateHold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdResourceId || !holdReason) return;
    try {
      await adminService.createLegalHold({
        resource_type: holdResourceType,
        resource_id: holdResourceId,
        reason: holdReason
      });
      setHoldResourceId('');
      setHoldReason('');
      loadData();
    } catch (err) {
      console.error('Create legal hold error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] dark:bg-[#0B0D12] p-6 space-y-6 overflow-y-auto text-xs select-none">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          Compliance & Data Governance
        </h2>
        <p className="text-slate-500 dark:text-mc-muted text-xs mt-0.5">
          Configure automated retention policies and active legal holds
        </p>
      </div>

      {/* Retention Policies */}
      <div className="p-6 bg-white dark:bg-[#11131A] border border-slate-200/80 dark:border-white/10 rounded-2xl space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
          <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          Automated Data Retention Policies
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['RECORDINGS', 'TRANSCRIPTS', 'MESSAGES'].map((resType) => {
            const existing = retentionPolicies.find((p) => p.resource_type === resType);
            return (
              <div
                key={resType}
                className="p-4 bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl space-y-2.5 transition-all hover:border-indigo-500/30"
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-900 dark:text-white tracking-wide text-xs font-display">
                    {resType}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider">
                    ACTIVE
                  </span>
                </div>
                <p className="text-slate-600 dark:text-mc-muted text-[11px]">
                  Retention Period:{' '}
                  <strong className="text-slate-900 dark:text-white font-semibold">
                    {existing?.retention_days || 365} Days
                  </strong>
                </p>
                <p className="text-slate-600 dark:text-mc-muted text-[11px]">
                  Action:{' '}
                  <strong className="text-rose-600 dark:text-rose-400 font-semibold">
                    {existing?.action || 'DELETE'}
                  </strong>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legal Holds Section */}
      <div className="p-6 bg-white dark:bg-[#11131A] border border-slate-200/80 dark:border-white/10 rounded-2xl space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
          <Lock className="w-4 h-4 text-amber-500" />
          Active Legal Holds
        </h3>

        {/* Create Legal Hold */}
        <form
          onSubmit={handleCreateHold}
          className="p-4 bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl flex flex-wrap md:flex-nowrap items-center gap-3"
        >
          <select
            value={holdResourceType}
            onChange={(e) => setHoldResourceType(e.target.value)}
            className="bg-white dark:bg-[#11131A] border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white px-3 py-2 rounded-xl focus:outline-none focus:border-indigo-500 text-xs shadow-sm"
          >
            <option value="RECORDINGS">RECORDINGS</option>
            <option value="TRANSCRIPTS">TRANSCRIPTS</option>
            <option value="MESSAGES">MESSAGES</option>
          </select>
          <input
            type="text"
            placeholder="Resource ID"
            value={holdResourceId}
            onChange={(e) => setHoldResourceId(e.target.value)}
            className="bg-white dark:bg-[#11131A] border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-mc-muted/60 px-3.5 py-2 rounded-xl flex-1 focus:outline-none focus:border-indigo-500 text-xs shadow-sm"
          />
          <input
            type="text"
            placeholder="Reason for Legal Hold"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            className="bg-white dark:bg-[#11131A] border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-mc-muted/60 px-3.5 py-2 rounded-xl flex-1 focus:outline-none focus:border-indigo-500 text-xs shadow-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-all active:scale-95 text-xs whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Apply Hold</span>
          </button>
        </form>

        {/* Holds List */}
        <div className="space-y-2">
          {legalHolds.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-mc-muted bg-slate-50 dark:bg-[#171923] border border-slate-200/60 dark:border-white/5 rounded-xl text-xs">
              No active legal holds currently placed on organization resources.
            </div>
          ) : (
            legalHolds.map((h) => (
              <div
                key={h.id}
                className="p-3.5 bg-slate-50 dark:bg-[#171923] border border-amber-500/30 rounded-xl flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {h.resource_type} — {h.resource_id}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-mc-muted text-[11px] mt-0.5">{h.reason}</p>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-mc-muted font-mono">
                  {new Date(h.created_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
