import React, { useEffect } from 'react';
import { MessageSquare, PhoneCall, X, Info } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotificationStore();

  useEffect(() => {
    if (toasts.length > 0) {
      const timer = setTimeout(() => {
        removeToast(toasts[toasts.length - 1].id);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2.5 max-w-sm w-full select-none pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto bg-[#1A1C23] border border-indigo-500/40 rounded-2xl p-4 shadow-2xl shadow-indigo-950/50 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300 backdrop-blur-xl"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
            {toast.type === 'call' ? (
              <PhoneCall className="w-4 h-4 text-emerald-400" />
            ) : toast.type === 'chat' ? (
              <MessageSquare className="w-4 h-4 text-indigo-400" />
            ) : (
              <Info className="w-4 h-4 text-cyan-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-xs !text-white truncate">{toast.title}</h4>
            <p className="text-[11px] !text-gray-300 line-clamp-2 mt-0.5 leading-relaxed">{toast.body}</p>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 !text-gray-400 hover:!text-white rounded hover:bg-white/10 shrink-0 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
