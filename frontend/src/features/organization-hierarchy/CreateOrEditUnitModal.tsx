import React, { useState, useEffect } from 'react';
import { X, Building2, Save, Loader2, AlertCircle } from 'lucide-react';
import { OrganizationUnit, HierarchyNode, User } from '../../types';
import { organizationHierarchyService } from '../../services/organizationHierarchyService';

export interface CreateOrEditUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingUnit?: OrganizationUnit | HierarchyNode | null;
  parentUnit?: HierarchyNode | null;
  allUnits: OrganizationUnit[];
  users: User[];
}

export const CreateOrEditUnitModal: React.FC<CreateOrEditUnitModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingUnit,
  parentUnit,
  allUnits,
  users
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unitType, setUnitType] = useState('DEPARTMENT');
  const [parentId, setParentId] = useState<string>('');
  const [managerId, setManagerId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [orderIndex, setOrderIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (editingUnit) {
      setName(editingUnit.name || '');
      setCode(editingUnit.code || '');
      setUnitType(editingUnit.unit_type || 'DEPARTMENT');
      setParentId(editingUnit.parent_id || '');
      setManagerId(editingUnit.manager_id || '');
      setDescription(editingUnit.description || '');
      setStatus(editingUnit.status || 'ACTIVE');
      setOrderIndex(editingUnit.order_index || 0);
    } else if (parentUnit) {
      setName('');
      setCode('');
      // Suggest logical child type
      const parentType = parentUnit.unit_type?.toUpperCase();
      if (parentType === 'BUSINESS_UNIT' || parentType === 'ORGANIZATION') setUnitType('DEPARTMENT');
      else if (parentType === 'DEPARTMENT') setUnitType('TEAM');
      else setUnitType('UNIT');

      setParentId(parentUnit.id);
      setManagerId('');
      setDescription('');
      setStatus('ACTIVE');
      setOrderIndex(0);
    } else {
      setName('');
      setCode('');
      setUnitType('BUSINESS_UNIT');
      setParentId('');
      setManagerId('');
      setDescription('');
      setStatus('ACTIVE');
      setOrderIndex(0);
    }
    setErrorMsg(null);
  }, [editingUnit, parentUnit, isOpen]);

  if (!isOpen) return null;

  // Filter out self and descendants from parent selection to prevent cycles in the dropdown
  const getDescendantIds = (rootId: string): Set<string> => {
    const descendants = new Set<string>([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const u of allUnits) {
        if (u.parent_id && descendants.has(u.parent_id) && !descendants.has(u.id)) {
          descendants.add(u.id);
          added = true;
        }
      }
    }
    return descendants;
  };

  const invalidParentIds = editingUnit ? getDescendantIds(editingUnit.id) : new Set<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Unit name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      if (editingUnit) {
        await organizationHierarchyService.updateUnit(editingUnit.id, {
          name: name.trim(),
          code: code.trim() || undefined,
          unit_type: unitType,
          parent_id: parentId ? parentId : undefined,
          clear_parent: !parentId,
          manager_id: managerId ? managerId : undefined,
          clear_manager: !managerId,
          description: description.trim() || undefined,
          status,
          order_index: Number(orderIndex) || 0
        });
      } else {
        await organizationHierarchyService.createUnit({
          name: name.trim(),
          code: code.trim() || undefined,
          unit_type: unitType,
          parent_id: parentId || null,
          manager_id: managerId || null,
          description: description.trim() || undefined,
          status,
          order_index: Number(orderIndex) || 0
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error?.message || err.message || 'Failed to save organizational unit';
      setErrorMsg(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-white dark:bg-[#11131A] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-xs text-slate-800 dark:text-mc-text transition-colors">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#151822]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                {editingUnit ? 'Edit Organizational Unit' : 'Create Organizational Unit'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-mc-muted">
                {editingUnit
                  ? `Updating ${editingUnit.name}`
                  : parentUnit
                  ? `Child unit under "${parentUnit.name}"`
                  : 'New top-level root unit'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-mc-muted hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unit Name & Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
                Unit Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Backend Engineering"
                className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
                Unit Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. ENG"
                maxLength={20}
                className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs font-mono uppercase focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Unit Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
                Unit Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="BUSINESS_UNIT">Business Unit</option>
                <option value="DEPARTMENT">Department</option>
                <option value="TEAM">Team</option>
                <option value="DIVISION">Division</option>
                <option value="ORGANIZATION">Organization Root</option>
                <option value="UNIT">Operational Unit</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="ACTIVE">Active (Available)</option>
                <option value="INACTIVE">Inactive (Archived)</option>
              </select>
            </div>
          </div>

          {/* Parent Unit Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
                Parent Unit
              </label>
              {parentId ? (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                  Sub-unit under selected parent
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 dark:text-mc-muted font-medium">
                  Root level (No parent)
                </span>
              )}
            </div>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">-- None (Top Level Root Unit) --</option>
              {allUnits
                .filter((u) => !invalidParentIds.has(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.code ? `(${u.code})` : ''} - [{u.unit_type}]
                  </option>
                ))}
            </select>
            {editingUnit && (
              <p className="text-[10px] text-slate-500 dark:text-mc-muted/60">
                Self and child units are disabled to prevent circular hierarchy.
              </p>
            )}
          </div>

          {/* Manager / Head Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
              Manager / Head
            </label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">-- No Manager Assigned --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} ({u.email}) {u.job_title ? `- ${u.job_title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
              Description / Mandate
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the unit purpose, charter, and responsibilities..."
              className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-mc-muted hover:text-slate-900 dark:hover:text-white font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingUnit ? 'Update Unit' : 'Create Unit'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
