import React, { useState } from 'react';
import { CheckSquare, Square, Calendar, User, Clock } from 'lucide-react';
import { ActionItem } from '../../types/meetingAI';
import { meetingAIService } from '../../services/meetingAIService';

interface ActionItemsProps {
  items: ActionItem[];
  onItemUpdated?: () => void;
}

export const ActionItemsView: React.FC<ActionItemsProps> = ({ items, onItemUpdated }) => {
  const [localItems, setLocalItems] = useState<ActionItem[]>(items);

  const toggleStatus = async (item: ActionItem) => {
    const nextStatus = item.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
    try {
      await meetingAIService.updateActionItem(item.id, { status: nextStatus });
      setLocalItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );
      if (onItemUpdated) onItemUpdated();
    } catch (err) {
      console.error('Update action item status error:', err);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-teams-muted text-xs">
        No action items extracted for this meeting.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 text-xs">
      <div className="flex items-center gap-2 font-bold text-white mb-1">
        <CheckSquare className="w-4 h-4 text-teams-purple" />
        <span>Meeting Action Items ({localItems.length})</span>
      </div>

      {localItems.map((item) => {
        const isCompleted = item.status === 'COMPLETED';
        return (
          <div
            key={item.id}
            onClick={() => toggleStatus(item)}
            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
              isCompleted
                ? 'bg-[#1D1C1C] border-teams-border/40 text-teams-muted opacity-60'
                : 'bg-[#252424] border-teams-border text-white hover:border-teams-purple/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <button className="mt-0.5 text-teams-purple">
                {isCompleted ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4 text-teams-muted" />}
              </button>
              <div>
                <p className={`font-semibold ${isCompleted ? 'line-through' : ''}`}>{item.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-teams-muted">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3 text-teams-purple" />
                    <span>{item.assignee_id ? 'Assigned' : 'Unassigned'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-400" />
                    <span>Due: {item.due_date || 'Not specified'}</span>
                  </span>
                </div>
              </div>
            </div>

            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
              item.priority === 'HIGH' ? 'bg-rose-950/60 text-rose-300 border border-rose-800/40' : 'bg-slate-800 text-slate-300'
            }`}>
              {item.priority}
            </span>
          </div>
        );
      })}
    </div>
  );
};
