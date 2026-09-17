import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Building2,
  FolderGit2,
  Layers,
  Users,
  Briefcase,
  Plus,
  Edit2,
  ArrowRightLeft,
  Trash2,
  Info,
  UserMinus
} from 'lucide-react';
import { HierarchyNode } from '../../types';
import { useAuthStore } from '../../stores/authStore';

export interface HierarchyNodeItemProps {
  node: HierarchyNode;
  level: number;
  expandedMap: Record<string, boolean>;
  onToggleExpand: (nodeId: string) => void;
  onSelectUnit: (node: HierarchyNode) => void;
  onAddChild: (parent: HierarchyNode) => void;
  onEdit: (node: HierarchyNode) => void;
  onMove: (node: HierarchyNode) => void;
  onDelete: (node: HierarchyNode) => void;
  onRemoveEmployee: (unitId: string, userId: string, userName: string) => void;
  searchQuery?: string;
  selectedUnitId?: string | null;
  canManage?: boolean;
}

export const HierarchyNodeItem: React.FC<HierarchyNodeItemProps> = ({
  node,
  level,
  expandedMap,
  onToggleExpand,
  onSelectUnit,
  onAddChild,
  onEdit,
  onMove,
  onDelete,
  onRemoveEmployee,
  searchQuery = '',
  selectedUnitId,
  canManage
}) => {
  const isExpanded = expandedMap[node.id] ?? true;
  const [showEmployees, setShowEmployees] = useState(false);
  const { user } = useAuthStore();
  const isAdmin = Boolean(
    canManage ||
    user?.is_admin ||
    user?.is_superuser ||
    ['ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN', 'ADMINISTRATOR', 'ROOT'].includes(user?.role?.toUpperCase() || '')
  );
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedUnitId === node.id;

  // Highlight if node or child matches search
  const isMatching = Boolean(
    searchQuery &&
    (node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (node.code && node.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (node.employees &&
        node.employees.some((e) =>
          e.display_name.toLowerCase().includes(searchQuery.toLowerCase())
        )))
  );

  // Unit type styling
  const getTypeBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case 'ORGANIZATION':
        return { label: 'Organization', bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', icon: Building2 };
      case 'BUSINESS_UNIT':
        return { label: 'Business Unit', bg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30', icon: FolderGit2 };
      case 'DIVISION':
        return { label: 'Division', bg: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30', icon: Layers };
      case 'DEPARTMENT':
        return { label: 'Department', bg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', icon: Briefcase };
      case 'TEAM':
        return { label: 'Team', bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', icon: Users };
      case 'UNIT':
      default:
        return { label: type || 'Unit', bg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30', icon: Users };
    }
  };

  const typeConfig = getTypeBadge(node.unit_type);
  const TypeIcon = typeConfig.icon;

  return (
    <div className="flex flex-col relative select-none">
      {/* Node Container Card */}
      <div
        className={`group relative flex items-center justify-between gap-3 px-3.5 py-2.5 my-1 rounded-xl transition-all duration-200 border org-node-card ${
          isSelected
            ? 'bg-indigo-50 dark:bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-600/10 text-indigo-900 dark:text-white'
            : isMatching
            ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-400 dark:border-amber-500/40 text-amber-900 dark:text-white'
            : 'bg-white dark:bg-[#13161F] hover:bg-slate-50 dark:hover:bg-[#1A1E2B] border-slate-200 dark:border-white/5 text-slate-800 dark:text-mc-text shadow-sm'
        }`}
        style={{ marginLeft: `${level * 24}px` }}
      >
        {/* Left Side: Expand Toggle, Icon, Title, Badges */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Chevron Expand Button */}
          {hasChildren ? (
            <button
              onClick={() => onToggleExpand(node.id)}
              className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-5 h-5 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
          )}

          {/* Unit Type Icon */}
          <div
            onClick={() => onSelectUnit(node)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer ${typeConfig.bg} border`}
          >
            <TypeIcon className="w-3.5 h-3.5" />
          </div>

          {/* Title and Code */}
          <div
            onClick={() => onSelectUnit(node)}
            className="flex items-center gap-2 min-w-0 cursor-pointer"
          >
            <span className="font-bold text-xs text-slate-900 dark:text-white font-display truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors org-node-title">
              {node.name}
            </span>

            {node.code && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 font-bold">
                {node.code}
              </span>
            )}
          </div>

          {/* Type Badge */}
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${typeConfig.bg}`}
          >
            {typeConfig.label}
          </span>

          {/* Inactive Status Badge */}
          {node.status === 'INACTIVE' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-700/40 border border-slate-300 dark:border-zinc-600 text-slate-700 dark:text-zinc-400 uppercase">
              Inactive
            </span>
          )}

          {/* Manager Chip */}
          {node.manager ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.08] border border-slate-200 dark:border-white/[0.12] text-[10px] text-slate-700 dark:text-slate-200 shrink-0">
              <div className="w-3.5 h-3.5 rounded-full bg-indigo-100 dark:bg-indigo-600/40 text-indigo-700 dark:text-indigo-200 text-[8px] flex items-center justify-center font-bold">
                {node.manager.display_name.charAt(0)}
              </div>
              <span className="truncate max-w-[110px] font-medium text-slate-800 dark:text-white/90">
                {node.manager.display_name}
              </span>
            </div>
          ) : (
            <span className="hidden md:inline text-[10px] text-slate-400 dark:text-slate-500 italic">
              No Manager
            </span>
          )}
        </div>

        {/* Right Side: Employee Counts & Node Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Employee Count Badges */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowEmployees(!showEmployees)}
              className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer org-member-badge ${
                node.direct_employee_count > 0
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/5'
              }`}
              title={`Direct: ${node.direct_employee_count} | Total Subtree: ${node.total_employee_count}`}
            >
              <Users className="w-3 h-3" />
              <span>{node.direct_employee_count} direct</span>
              {node.total_employee_count > node.direct_employee_count && (
                <span className="text-[9px] text-emerald-700/80 dark:text-emerald-400/70 border-l border-emerald-300 dark:border-emerald-500/30 pl-1">
                  {node.total_employee_count} total
                </span>
              )}
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
            {isAdmin && (
              <button
                onClick={() => onAddChild(node)}
                className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-600/20 hover:bg-indigo-100 dark:hover:bg-indigo-600/30 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer"
                title="Add Child Unit under this unit"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Child</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => onEdit(node)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                title="Edit Unit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => onMove(node)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                title="Move Unit"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => onSelectUnit(node)}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
              title="Unit Details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            {isAdmin && (
              <button
                onClick={() => onDelete(node)}
                className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer"
                title="Delete Unit"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Direct Employees Roster */}
      {showEmployees && node.employees && node.employees.length > 0 && (
        <div
          className="ml-6 my-1 pl-4 border-l-2 border-dashed border-slate-300 dark:border-white/10 space-y-1.5"
          style={{ marginLeft: `${level * 24 + 18}px` }}
        >
          <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Users className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Assigned Employees ({node.employees.length})</span>
          </div>
          {node.employees.map((emp) => (
            <div
              key={emp.id}
              className="flex items-center justify-between bg-white dark:bg-[#0E1017] hover:bg-slate-50 dark:hover:bg-[#141722] border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-lg text-xs transition-colors shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 text-white font-bold text-[9px] flex items-center justify-center">
                  {emp.display_name.charAt(0)}
                </div>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white text-[11px] mr-2">
                    {emp.display_name}
                  </span>
                  {emp.job_title && (
                    <span className="text-[10px] text-slate-600 dark:text-slate-400">
                      ({emp.job_title})
                    </span>
                  )}
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => onRemoveEmployee(node.id, emp.id, emp.display_name)}
                  className="text-[10px] text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Remove from Unit"
                >
                  <UserMinus className="w-3 h-3" />
                  <span>Unassign</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recursive Children Nodes */}
      {isExpanded && hasChildren && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <HierarchyNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedMap={expandedMap}
              onToggleExpand={onToggleExpand}
              onSelectUnit={onSelectUnit}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
              onRemoveEmployee={onRemoveEmployee}
              searchQuery={searchQuery}
              selectedUnitId={selectedUnitId}
              canManage={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
};
