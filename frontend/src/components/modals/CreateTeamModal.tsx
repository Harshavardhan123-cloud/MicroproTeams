import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { apiClient } from '../../api/client';

interface CreateTeamModalProps {
  onSuccess: () => void;
}

export const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ onSuccess }) => {
  const { isCreateTeamOpen, setCreateTeamOpen } = useUIStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCreateTeamOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setIsSubmitting(true);
      await apiClient.post('/teams', { name, description, privacy });
      setName('');
      setDescription('');
      setCreateTeamOpen(false);
      onSuccess();
    } catch (err) {
      console.error('Create team error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#252525] border border-teams-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-teams-border flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-base text-white">
            <FolderPlus className="w-5 h-5 text-teams-purple" />
            <span>Create a New Team</span>
          </div>
          <button
            onClick={() => setCreateTeamOpen(false)}
            className="p-1 text-teams-muted hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Team Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Product Launch"
              required
              className="w-full bg-[#1F1F1F] border border-teams-border rounded-md px-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the team's objective..."
              rows={3}
              className="w-full bg-[#1F1F1F] border border-teams-border rounded-md px-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Privacy
            </label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'private')}
              className="w-full bg-[#1F1F1F] border border-teams-border rounded-md px-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
            >
              <option value="public">Public — Anyone in organization can join</option>
              <option value="private">Private — Invite only</option>
            </select>
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-teams-border">
            <button
              type="button"
              onClick={() => setCreateTeamOpen(false)}
              className="px-4 py-2 rounded-md text-xs font-semibold text-teams-muted hover:text-white hover:bg-teams-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 rounded-md font-semibold text-xs bg-teams-purple text-white hover:bg-teams-purple-hover disabled:opacity-50 transition-colors shadow-md"
            >
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
