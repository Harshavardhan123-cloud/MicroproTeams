import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Loader2, AlertCircle } from 'lucide-react';
import { OrganizationUnit, HierarchyNode } from '../../types';
import { organizationHierarchyService } from '../../services/organizationHierarchyService';

export interface MoveUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMoved: () => void;
  targetUnit: HierarchyNode | null;
  allUnits: OrganizationUnit[];
}

export const MoveUnitModal: React.FC<MoveUnitModalProps> = ({
  isOpen,
  onClose,
  onMoved,
  targetUnit,
  allUnits
}) => {
  const [newParentId, setNewParentId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (targetUnit) {
      setNewParentId(targetUnit.parent_id || '');
    }
    setErrorMsg(null);
  }, [targetUnit, isOpen]);

  if (!isOpen || !targetUnit) return null;

  // Compute invalid IDs (self and all descendants) to prevent cycles
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

  const invalidParentIds = getDescendantIds(targetUnit.id);
  const currentParent = allUnits.find((u) => u.id === targetUnit.parent_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newParentId === (targetUnit.parent_id || '')) {
      onClose();
      return;
    }

    if (newParentId && invalidParentIds.has(newParentId)) {
      setErrorMsg('Cannot move unit under itself or one of its child units (circular hierarchy).');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      await organizationHierarchyService.updateUnit(targetUnit.id, {
        parent_id: newParentId ? newParentId : undefined,
        clear_parent: !newParentId
      });

      onMoved();
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error?.message || err.message || 'Failed to move unit';
      setErrorMsg(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-white dark:bg-[#11131A] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-xs text-slate-800 dark:text-mc-text transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#151822]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">Move Organizational Unit</h2>
              <p className="text-[11px] text-slate-500 dark:text-mc-muted">Change parent node in hierarchy</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-mc-muted hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unit being moved */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-mc-muted">Target Unit</span>
              <p className="font-bold text-slate-900 dark:text-white text-xs">{targetUnit.name}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-50 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-500/30">
              {targetUnit.unit_type}
            </span>
          </div>

          {/* Current Parent */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
              Current Parent
            </label>
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#171923]/60 border border-slate-200 dark:border-white/5 text-slate-700 dark:text-mc-muted">
              {currentParent ? `${currentParent.name} (${currentParent.code || currentParent.unit_type})` : 'Top-Level Root Unit'}
            </div>
          </div>

          {/* New Parent Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-mc-muted uppercase tracking-wider">
              Select New Parent Unit
            </label>
            <select
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="">-- Make Top-Level Root --</option>
              {allUnits
                .filter((u) => !invalidParentIds.has(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.code ? `(${u.code})` : ''} - [{u.unit_type}]
                  </option>
                ))}
            </select>
            <p className="text-[10px] text-slate-500 dark:text-mc-muted/60">
              Descendant units are automatically excluded to preserve acyclic tree integrity.
            </p>
          </div>

          {/* Actions */}
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
              disabled={isSubmitting || newParentId === (targetUnit.parent_id || '')}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Moving...</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Confirm Move</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
