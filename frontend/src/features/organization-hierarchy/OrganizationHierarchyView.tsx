import React, { useEffect, useState, useMemo } from 'react';
import {
  Network,
  Plus,
  Search,
  RefreshCw,
  Maximize2,
  Minimize2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { HierarchyNode, OrganizationUnit, User } from '../../types';
import { organizationHierarchyService } from '../../services/organizationHierarchyService';
import { userService } from '../../services/userService';
import { HierarchyNodeItem } from './HierarchyNodeItem';
import { CreateOrEditUnitModal } from './CreateOrEditUnitModal';
import { MoveUnitModal } from './MoveUnitModal';
import { DeleteUnitModal } from './DeleteUnitModal';
import { UnitDetailsDrawer } from './UnitDetailsDrawer';
import { useAuthStore } from '../../stores/authStore';

export interface OrganizationHierarchyViewProps {
  canManage?: boolean;
  onUnitsUpdated?: () => void;
}

export const OrganizationHierarchyView: React.FC<OrganizationHierarchyViewProps> = ({
  canManage,
  onUnitsUpdated
}) => {
  const { user } = useAuthStore();
  const isAdmin = Boolean(
    canManage ||
    user?.is_admin ||
    user?.is_superuser ||
    ['ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN', 'ADMINISTRATOR', 'ROOT'].includes(user?.role?.toUpperCase() || '')
  );
  const [tree, setTree] = useState<HierarchyNode[]>([]);
  const [flatUnits, setFlatUnits] = useState<OrganizationUnit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');

  // Expanded nodes map
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<OrganizationUnit | HierarchyNode | null>(null);
  const [parentUnitForAdd, setParentUnitForAdd] = useState<HierarchyNode | null>(null);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [targetUnitForMove, setTargetUnitForMove] = useState<HierarchyNode | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [targetUnitForDelete, setTargetUnitForDelete] = useState<HierarchyNode | null>(null);

  const [selectedUnitForDetails, setSelectedUnitForDetails] = useState<HierarchyNode | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      const [treeData, unitsData, usersData] = await Promise.all([
        organizationHierarchyService.getHierarchy(statusFilter === 'ALL' ? undefined : statusFilter, true),
        organizationHierarchyService.getUnits({ status: statusFilter === 'ALL' ? undefined : statusFilter }),
        userService.getUsers()
      ]);

      setTree(treeData);
      setFlatUnits(unitsData);
      const uList = Array.isArray(usersData) ? usersData : (usersData as any)?.data || [];
      setUsers(uList);

      // Default all nodes to expanded
      const initialExpanded: Record<string, boolean> = {};
      const populateExpanded = (nodes: HierarchyNode[]) => {
        for (const n of nodes) {
          initialExpanded[n.id] = true;
          if (n.children && n.children.length > 0) {
            populateExpanded(n.children);
          }
        }
      };
      populateExpanded(treeData);
      setExpandedMap((prev) => ({ ...initialExpanded, ...prev }));
      onUnitsUpdated?.();
    } catch (err: any) {
      console.error('Failed to load organization hierarchy:', err);
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to load organization hierarchy data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    const setAll = (nodes: HierarchyNode[]) => {
      for (const n of nodes) {
        next[n.id] = true;
        if (n.children) setAll(n.children);
      }
    };
    setAll(tree);
    setExpandedMap(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    const setAll = (nodes: HierarchyNode[]) => {
      for (const n of nodes) {
        next[n.id] = false;
        if (n.children) setAll(n.children);
      }
    };
    setAll(tree);
    setExpandedMap(next);
  };

  // Node Actions
  const handleAddChild = (parent: HierarchyNode) => {
    setEditingUnit(null);
    setParentUnitForAdd(parent);
    setIsCreateModalOpen(true);
  };

  const handleEditUnit = (node: HierarchyNode) => {
    setEditingUnit(node);
    setParentUnitForAdd(null);
    setIsCreateModalOpen(true);
  };

  const handleMoveUnit = (node: HierarchyNode) => {
    setTargetUnitForMove(node);
    setIsMoveModalOpen(true);
  };

  const handleDeleteUnit = (node: HierarchyNode) => {
    setTargetUnitForDelete(node);
    setIsDeleteModalOpen(true);
  };

  const handleSelectUnit = (node: HierarchyNode) => {
    setSelectedUnitForDetails(node);
  };

  const handleAssignEmployee = async (unitId: string, userId: string) => {
    try {
      await organizationHierarchyService.assignEmployee(unitId, userId);
      await loadData();
      // Keep drawer in sync
      if (selectedUnitForDetails && selectedUnitForDetails.id === unitId) {
        const updated = await organizationHierarchyService.getUnit(unitId);
        setSelectedUnitForDetails(updated as any);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to assign employee');
    }
  };

  const handleRemoveEmployee = async (unitId: string, userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to unassign ${userName} from this organizational unit?`)) return;
    try {
      await organizationHierarchyService.removeEmployee(unitId, userId);
      await loadData();
      if (selectedUnitForDetails && selectedUnitForDetails.id === unitId) {
        const updated = await organizationHierarchyService.getUnit(unitId);
        setSelectedUnitForDetails(updated as any);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to remove employee');
    }
  };

  // Metrics summary
  const totalUnitsCount = flatUnits.length;
  const rootUnitsCount = tree.length;
  const totalAssignedEmployees = useMemo(() => {
    let count = 0;
    for (const u of tree) {
      count += u.total_employee_count || 0;
    }
    return count;
  }, [tree]);

  // Filter tree recursively if type filter is applied
  const filteredTree = useMemo(() => {
    if (typeFilter === 'ALL' && !searchQuery.trim()) return tree;

    const filterNode = (node: HierarchyNode): HierarchyNode | null => {
      const matchesType = typeFilter === 'ALL' || node.unit_type?.toUpperCase() === typeFilter;
      const matchesSearch =
        !searchQuery.trim() ||
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (node.code && node.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (node.employees &&
          node.employees.some((e) =>
            e.display_name.toLowerCase().includes(searchQuery.toLowerCase())
          ));

      const filteredChildren: HierarchyNode[] = [];
      if (node.children) {
        for (const child of node.children) {
          const match = filterNode(child);
          if (match) filteredChildren.push(match);
        }
      }

      if ((matchesType && matchesSearch) || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }
      return null;
    };

    const result: HierarchyNode[] = [];
    for (const root of tree) {
      const res = filterNode(root);
      if (res) result.push(res);
    }
    return result;
  }, [tree, typeFilter, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-[#0B0D12] text-slate-800 dark:text-mc-text overflow-hidden select-none relative org-hierarchy-view transition-colors">
      {/* Top Action Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#11131A] flex flex-wrap items-center justify-between gap-3 shrink-0 transition-colors">
        {/* Left Side: Search & Filters */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px] max-w-2xl">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-mc-muted absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search units, codes, or employees in hierarchy..."
              className="w-full bg-slate-100 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-mc-muted/60 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Unit Type Filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-slate-100 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="ALL">All Levels</option>
              <option value="ORGANIZATION">Organization Root</option>
              <option value="BUSINESS_UNIT">Business Unit</option>
              <option value="DEPARTMENT">Department</option>
              <option value="TEAM">Team</option>
              <option value="DIVISION">Division</option>
              <option value="UNIT">Unit</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-100 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="ACTIVE">Active Units</option>
              <option value="INACTIVE">Inactive Units</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>
        </div>

        {/* Right Side: Tree controls & Add Unit Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={expandAll}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Expand all nodes"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Expand All</span>
          </button>

          <button
            onClick={collapseAll}
            className="px-2.5 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200 dark:border-white/10 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Collapse all nodes"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Collapse All</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
            title="Refresh Hierarchy"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setEditingUnit(null);
                setParentUnitForAdd(null);
                setIsCreateModalOpen(true);
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/25 transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Unit</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="px-6 py-2.5 border-b border-indigo-100 dark:border-white/5 bg-[#EEF2FF] dark:bg-[#141620] org-kpi-bar flex items-center gap-6 text-[11px] shrink-0 overflow-x-auto transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-slate-700 dark:text-slate-300 font-semibold">Total Units:</span>
          <span className="font-bold text-slate-900 dark:text-white bg-white dark:bg-white/10 border border-slate-200 dark:border-transparent px-2 py-0.5 rounded-full shadow-sm">{totalUnitsCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-700 dark:text-slate-300 font-semibold">Root Units:</span>
          <span className="font-bold text-indigo-700 dark:text-purple-400 bg-indigo-100 dark:bg-purple-500/10 border border-indigo-200 dark:border-transparent px-2 py-0.5 rounded-full">{rootUnitsCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-700 dark:text-slate-300 font-semibold">Mapped Employees:</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-transparent px-2 py-0.5 rounded-full">{totalAssignedEmployees}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Dynamic multi-level organization hierarchy (No circular reference guarantee)</span>
        </div>
      </div>

      {/* Tree Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-mc-muted gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            <p className="text-xs">Building organization hierarchy tree...</p>
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 max-w-lg mx-auto flex items-start gap-3 text-xs">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Error loading hierarchy</p>
              <p className="text-rose-500/80 dark:text-rose-400/80">{errorMsg}</p>
            </div>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-mc-muted">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">No Organizational Units Found</h3>
              <p className="text-slate-500 dark:text-mc-muted text-xs mt-1">
                {searchQuery || typeFilter !== 'ALL'
                  ? 'No units match your active filter criteria.'
                  : 'Start by creating your organization root or first business unit.'}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditingUnit(null);
                  setParentUnitForAdd(null);
                  setIsCreateModalOpen(true);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Unit</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1 max-w-5xl mx-auto">
            {filteredTree.map((rootNode) => (
              <HierarchyNodeItem
                key={rootNode.id}
                node={rootNode}
                level={0}
                expandedMap={expandedMap}
                onToggleExpand={toggleExpand}
                onSelectUnit={handleSelectUnit}
                onAddChild={handleAddChild}
                onEdit={handleEditUnit}
                onMove={handleMoveUnit}
                onDelete={handleDeleteUnit}
                onRemoveEmployee={handleRemoveEmployee}
                searchQuery={searchQuery}
                selectedUnitId={selectedUnitForDetails?.id}
                canManage={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateOrEditUnitModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={loadData}
        editingUnit={editingUnit}
        parentUnit={parentUnitForAdd}
        allUnits={flatUnits}
        users={users}
      />

      <MoveUnitModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        onMoved={loadData}
        targetUnit={targetUnitForMove}
        allUnits={flatUnits}
      />

      <DeleteUnitModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onDeleted={loadData}
        targetUnit={targetUnitForDelete}
      />

      <UnitDetailsDrawer
        unit={selectedUnitForDetails}
        onClose={() => setSelectedUnitForDetails(null)}
        users={users}
        onAssignEmployee={handleAssignEmployee}
        onRemoveEmployee={handleRemoveEmployee}
        onAddChild={handleAddChild}
        canManage={isAdmin}
      />
    </div>
  );
};
