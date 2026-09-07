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
    <div className="flex flex-col h-full bg-[#181818] p-6 space-y-6 overflow-y-auto text-xs text-teams-text select-none">
      <div>
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Compliance & Data Governance
        </h2>
        <p className="text-teams-muted text-xs">Configure automated retention policies and active legal holds</p>
      </div>

      {/* Retention Policies */}
      <div className="p-5 bg-[#1F1F1F] border border-teams-border rounded-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <FileText className="w-4 h-4 text-teams-purple" />
          Automated Data Retention Policies
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['RECORDINGS', 'TRANSCRIPTS', 'MESSAGES'].map((resType) => {
            const existing = retentionPolicies.find((p) => p.resource_type === resType);
            return (
              <div key={resType} className="p-4 bg-[#252424] border border-teams-border rounded-xl space-y-2">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>{resType}</span>
                  <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded text-[10px]">
                    ACTIVE
                  </span>
                </div>
                <p className="text-teams-muted text-[11px]">
                  Retention Period: <strong className="text-white">{existing?.retention_days || 365} Days</strong>
                </p>
                <p className="text-teams-muted text-[11px]">
                  Action: <strong className="text-rose-400">{existing?.action || 'DELETE'}</strong>
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legal Holds Section */}
      <div className="p-5 bg-[#1F1F1F] border border-teams-border rounded-xl space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400" />
          Active Legal Holds
        </h3>

        {/* Create Legal Hold */}
        <form onSubmit={handleCreateHold} className="p-4 bg-[#252424] border border-teams-border rounded-xl flex items-center gap-3">
          <select
            value={holdResourceType}
            onChange={(e) => setHoldResourceType(e.target.value)}
            className="bg-[#181818] border border-teams-border text-white px-3 py-1.5 rounded-lg focus:outline-none"
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
            className="bg-[#181818] border border-teams-border text-white px-3 py-1.5 rounded-lg flex-1"
          />
          <input
            type="text"
            placeholder="Reason for Legal Hold"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            className="bg-[#181818] border border-teams-border text-white px-3 py-1.5 rounded-lg flex-1"
          />
          <button
            type="submit"
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Apply Hold</span>
          </button>
        </form>

        {/* Holds List */}
        <div className="space-y-2">
          {legalHolds.length === 0 ? (
            <div className="p-4 text-center text-teams-muted bg-[#252424] rounded-xl">
              No active legal holds currently placed on organization resources.
            </div>
          ) : (
            legalHolds.map((h) => (
              <div key={h.id} className="p-3 bg-[#252424] border border-amber-500/40 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>{h.resource_type} — {h.resource_id}</span>
                  </div>
                  <p className="text-teams-muted text-[11px] mt-0.5">{h.reason}</p>
                </div>
                <span className="text-[10px] text-teams-muted font-mono">{new Date(h.created_at).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
