import React from 'react';
import { Trash2, X, AlertTriangle, ShieldCheck } from 'lucide-react';

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: 'me' | 'everyone') => void;
  isAdmin?: boolean;
  canDeleteForEveryone?: boolean;
  itemType?: 'message' | 'chat';
}

export const DeleteMessageModal: React.FC<DeleteMessageModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isAdmin = false,
  canDeleteForEveryone,
  itemType = 'message'
}) => {
  if (!isOpen) return null;

  const allowEveryone = canDeleteForEveryone !== undefined ? canDeleteForEveryone : isAdmin;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-[#171923] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#11131A]">
          <div className="flex items-center gap-2 font-bold text-sm text-white font-display">
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Delete {itemType === 'chat' ? 'Chat' : 'Message'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-mc-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {allowEveryone ? (
                isAdmin && !canDeleteForEveryone ? (
                  <>As an Administrator, you can remove this {itemType} for yourself or permanently delete it for all conversation members.</>
                ) : (
                  <>You can delete this {itemType} for everyone in the conversation, or remove it for yourself only.</>
                )
              ) : (
                <>This action will remove the {itemType} from your view. Other participants will still be able to see it.</>
              )}
            </p>
          </div>

          {allowEveryone && isAdmin && (
            <div className="flex items-center gap-2 text-[11px] text-indigo-400 font-semibold px-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Options Available</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 p-5 pt-0">
          {allowEveryone ? (
            <>
              <button
                onClick={() => {
                  onConfirm('everyone');
                  onClose();
                }}
                className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete for Everyone</span>
              </button>

              <button
                onClick={() => {
                  onConfirm('me');
                  onClose();
                }}
                className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <span>Delete for Me Only</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                onConfirm('me');
                onClose();
              }}
              className="w-full py-2.5 px-4 text-xs font-bold text-white rounded-xl bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete for Me</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-mc-muted hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};
