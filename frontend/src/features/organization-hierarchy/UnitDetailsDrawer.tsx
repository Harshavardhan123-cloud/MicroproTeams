import React, { useState } from 'react';
import {
  X,
  Building2,
  Users,
  Briefcase,
  Layers,
  UserCheck,
  UserPlus,
  UserMinus,
  Mail,
  Calendar,
  Info,
  Check,
  Search,
  ChevronDown,
  RefreshCw,
  Plus
} from 'lucide-react';
import { HierarchyNode, User } from '../../types';
import { useAuthStore } from '../../stores/authStore';

export interface UnitDetailsDrawerProps {
  unit: HierarchyNode | null;
  onClose: () => void;
  users: User[];
  onAssignEmployee: (unitId: string, userId: string) => void | Promise<void>;
  onRemoveEmployee: (unitId: string, userId: string, userName: string) => void;
  onAddChild?: (parent: HierarchyNode) => void;
  canManage?: boolean;
}

export const UnitDetailsDrawer: React.FC<UnitDetailsDrawerProps> = ({
  unit,
  onClose,
  users,
  onAssignEmployee,
  onRemoveEmployee,
  onAddChild,
  canManage
}) => {
  const { user } = useAuthStore();
  const isAdmin = Boolean(
    canManage ||
    user?.is_admin ||
    user?.is_superuser ||
    ['ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN', 'ADMINISTRATOR', 'ROOT'].includes(user?.role?.toUpperCase() || '')
  );
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUserToAssign, setSelectedUserToAssign] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  if (!unit) return null;

  const directEmployees = unit.employees || [];
  const filteredEmployees = directEmployees.filter(
    (e) =>
      e.display_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      e.email.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (e.job_title && e.job_title.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  // Users not currently in this unit
  const unassignedUsers = users.filter(
    (u) => !directEmployees.some((de) => de.id === u.id)
  );

  const handleAssign = async () => {
    if (!selectedUserToAssign || isAssigning) return;
    try {
      setIsAssigning(true);
      await onAssignEmployee(unit.id, selectedUserToAssign);
      setSelectedUserToAssign('');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white dark:bg-[#11131A] border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col text-xs text-slate-800 dark:text-mc-text animate-slide-left select-none transition-colors">
      {/* Drawer Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#151822] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display truncate">
              {unit.name}
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-mc-muted">
              <span>Type: {unit.unit_type}</span>
              {unit.code && <span>• Code: {unit.code}</span>}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-mc-muted hover:text-slate-900 dark:hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Overview Stats Bar */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5">
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Direct Employees</span>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-display mt-0.5">
              {unit.direct_employee_count}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5">
            <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400">Total Subtree Count</span>
            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 font-display mt-0.5">
              {unit.total_employee_count}
            </p>
          </div>
        </div>

        {/* Unit Description */}
        {unit.description && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Description
            </span>
            <p className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923]/60 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-slate-300 leading-relaxed">
              {unit.description}
            </p>
          </div>
        )}

        {/* Manager Card */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Unit Manager / Head
          </span>
          {unit.manager ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  {unit.manager.display_name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white text-xs">{unit.manager.display_name}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{unit.manager.email}</p>
                  {unit.manager.job_title && (
                    <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                      {unit.manager.job_title}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923]/40 border border-dashed border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 italic text-center">
              No manager assigned to this unit yet.
            </div>
          )}
        </div>

        {/* Direct Child Units */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Child Units ({unit.children?.length || 0})
            </span>
            {isAdmin && onAddChild && (
              <button
                onClick={() => onAddChild(unit)}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 hover:bg-indigo-100 dark:hover:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                title="Add a new child unit directly under this unit"
              >
                <Plus className="w-3 h-3" />
                <span>Add Child Unit</span>
              </button>
            )}
          </div>
          {unit.children && unit.children.length > 0 ? (
            <div className="space-y-1">
              {unit.children.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span className="font-bold text-slate-900 dark:text-white text-xs">{c.name}</span>
                    {c.code && (
                      <span className="text-[10px] font-mono text-slate-500 dark:text-mc-muted font-semibold">
                        ({c.code})
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {c.total_employee_count} members
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923]/40 border border-dashed border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 text-[11px] flex items-center justify-between">
              <span>No sub-units under this unit.</span>
              {isAdmin && onAddChild && (
                <button
                  onClick={() => onAddChild(unit)}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Create sub-unit</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Assigned Employees Roster Section */}
        <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              Direct Members
              <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200 text-[10px] font-mono">
                {directEmployees.length}
              </span>
            </span>
            {unassignedUsers.length > 0 && (
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                {unassignedUsers.length} available to assign
              </span>
            )}
          </div>

          {/* Quick Assign Member Card (Admins Only) */}
          {isAdmin && (
            <div className="p-3 bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-2xl space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white/90 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <UserPlus className="w-3 h-3" />
                  </div>
                  Assign Employee
                </span>
                {selectedUserToAssign && (
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Ready
                  </span>
                )}
              </div>

              {unassignedUsers.length > 0 ? (
                <div className="space-y-2">
                  <div className="relative">
                    <select
                      value={selectedUserToAssign}
                      onChange={(e) => setSelectedUserToAssign(e.target.value)}
                      className="w-full bg-white dark:bg-[#0F1117] border border-slate-200 dark:border-white/10 rounded-xl pl-3 pr-8 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="" className="text-slate-500 dark:text-slate-400">
                        -- Select employee to assign --
                      </option>
                      {unassignedUsers.map((u) => (
                        <option key={u.id} value={u.id} className="bg-white dark:bg-[#171923] text-slate-900 dark:text-white">
                          {u.display_name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <button
                    type="button"
                    onClick={handleAssign}
                    disabled={!selectedUserToAssign || isAssigning}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                      selectedUserToAssign && !isAssigning
                        ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/30 active:scale-[0.99] cursor-pointer'
                        : 'bg-slate-200/70 dark:bg-white/[0.04] border border-slate-300 dark:border-white/5 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isAssigning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Assigning Member...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>
                          {selectedUserToAssign
                            ? `Assign to ${unit.name}`
                            : 'Select Employee to Assign'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 text-center text-slate-600 dark:text-slate-400 text-[11px]">
                  All organization members are assigned to this unit.
                </div>
              )}
            </div>
          )}

          {/* Search inside roster */}
          {directEmployees.length > 3 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search assigned members..."
                className="w-full bg-slate-100 dark:bg-[#171923] border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-3 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          )}

          {/* Members List */}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((emp) => (
                <div
                  key={emp.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-white/[0.02] transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                      {emp.display_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-xs truncate">{emp.display_name}</p>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">{emp.email}</p>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => onRemoveEmployee(unit.id, emp.id, emp.display_name)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                      title="Remove from Unit"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#171923]/30 text-center text-slate-500 dark:text-slate-400 italic border border-slate-200 dark:border-transparent">
                {directEmployees.length === 0
                  ? 'No employees assigned directly to this unit yet.'
                  : 'No employees matched your search filter.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
