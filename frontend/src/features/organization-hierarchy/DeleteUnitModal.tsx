import React, { useState } from 'react';
import { X, Trash2, AlertTriangle, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { HierarchyNode } from '../../types';
import { organizationHierarchyService } from '../../services/organizationHierarchyService';

export interface DeleteUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
  targetUnit: HierarchyNode | null;
}

export const DeleteUnitModal: React.FC<DeleteUnitModalProps> = ({
  isOpen,
  onClose,
  onDeleted,
  targetUnit
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !targetUnit) return null;

  const childCount = targetUnit.children ? targetUnit.children.length : 0;
  const directEmployeeCount = targetUnit.direct_employee_count || 0;
  const isBlocked = childCount > 0 || directEmployeeCount > 0;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setErrorMsg(null);

      await organizationHierarchyService.deleteUnit(targetUnit.id);
      onDeleted();
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.response?.data?.error?.message || err.message || 'Failed to delete unit';
      setErrorMsg(detail);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-white dark:bg-[#11131A] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col text-xs text-slate-800 dark:text-mc-text transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-[#151822]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-red-600 text-white flex items-center justify-center shadow-md shadow-rose-600/20">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">Delete Organizational Unit</h2>
              <p className="text-[11px] text-slate-500 dark:text-mc-muted">Verify safe deletion constraints</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-mc-muted hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unit Summary Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#171923] border border-slate-200 dark:border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white text-xs">{targetUnit.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-mc-muted border border-slate-300 dark:border-white/10 font-mono">
                {targetUnit.code || targetUnit.unit_type}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-mc-muted">{targetUnit.description || 'No description provided.'}</p>
          </div>

          {/* Safety Rule Condition Evaluation */}
          {isBlocked ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Safe Deletion Rule Enforced</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                This organizational unit cannot be deleted because it contains:
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-1 font-semibold pl-1">
                {childCount > 0 && (
                  <li>{childCount} active child organizational unit(s)</li>
                )}
                {directEmployeeCount > 0 && (
                  <li>{directEmployeeCount} assigned employee(s)</li>
                )}
              </ul>
              <p className="text-[10px] text-amber-700 dark:text-amber-400/80 pt-1">
                Please move or reassign them before deleting this unit.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                Unit is empty (0 child units and 0 assigned employees). It can be safely deleted.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-mc-muted hover:text-slate-900 dark:hover:text-white font-semibold transition-colors cursor-pointer"
            >
              {isBlocked ? 'Close' : 'Cancel'}
            </button>

            {!isBlocked && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-rose-600/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Unit</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
