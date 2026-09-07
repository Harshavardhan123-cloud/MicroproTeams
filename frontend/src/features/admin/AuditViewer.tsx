import React, { useEffect, useState } from 'react';
import { ShieldCheck, Search, Filter, RefreshCw, Clock, User, Activity } from 'lucide-react';
import { AuditLogItem } from '../../types/meetingAI';
import { adminService } from '../../services/adminService';

export const AuditViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await adminService.getAuditLogs({
        action: actionFilter || undefined,
        resource: resourceFilter || undefined
      });
      setLogs(data);
    } catch (err) {
      console.error('Fetch audit logs error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, resourceFilter]);

  return (
    <div className="flex flex-col h-full bg-[#181818] p-6 space-y-4 overflow-y-auto text-xs text-teams-text">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teams-purple" />
            Enterprise Audit Logs
          </h2>
          <p className="text-teams-muted text-xs">Immutable security and compliance event tracking</p>
        </div>
        <button
          onClick={fetchLogs}
          className="px-3 py-1.5 bg-[#252424] hover:bg-teams-hover text-white rounded-lg flex items-center gap-2 border border-teams-border font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 bg-[#1F1F1F] border border-teams-border rounded-xl flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Filter className="w-3.5 h-3.5 text-teams-muted" />
          <input
            type="text"
            placeholder="Filter by action (e.g. RECORDING_STARTED)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full bg-[#141414] border border-teams-border text-white px-3 py-1.5 rounded-lg focus:outline-none focus:border-teams-purple"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Filter by resource (e.g. RECORDING)"
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="w-full bg-[#141414] border border-teams-border text-white px-3 py-1.5 rounded-lg focus:outline-none focus:border-teams-purple"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-[#1F1F1F] border border-teams-border rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#252424] border-b border-teams-border text-teams-muted font-bold uppercase text-[10px] tracking-wider">
              <th className="p-3">Timestamp</th>
              <th className="p-3">Actor / User</th>
              <th className="p-3">Action</th>
              <th className="p-3">Resource Type</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-teams-border/60">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-teams-muted">
                  No audit log entries matched the query filter.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-[#252424] transition-colors">
                  <td className="p-3 font-mono text-teams-muted whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="p-3 font-semibold text-white">
                    {log.actor_id ? log.actor_id.substring(0, 8) + '...' : 'System'}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-teams-purple/20 text-teams-purple border border-teams-purple/40 font-mono text-[10px] rounded font-bold">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 font-semibold text-white">{log.resource_type}</td>
                  <td className="p-3 text-teams-muted max-w-xs truncate">{log.details || 'N/A'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
