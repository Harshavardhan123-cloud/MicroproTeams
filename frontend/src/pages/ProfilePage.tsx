import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { User, Mail, Building, Briefcase, Globe, Shield, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#181818] text-teams-text flex flex-col">
      {/* Top Bar */}
      <div className="h-14 bg-[#1F1F1F] border-b border-teams-border flex items-center px-6 gap-4">
        <button
          onClick={() => navigate('/app/teams')}
          className="p-1.5 text-teams-muted hover:text-white rounded hover:bg-teams-hover transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base text-white">Enterprise Profile Settings</h1>
      </div>

      <div className="flex-1 max-w-4xl w-full mx-auto p-8 space-y-6">
        {/* Profile Card Header */}
        <div className="bg-[#1F1F1F] border border-teams-border rounded-2xl p-6 flex items-center gap-6 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-teams-purple flex items-center justify-center font-bold text-3xl text-white uppercase shadow-inner border-2 border-teams-purple/40">
            {user?.display_name?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{user?.display_name}</h2>
            <p className="text-xs text-teams-muted flex items-center gap-2">
              <span>@{user?.username}</span>
              <span>•</span>
              <span className="capitalize px-2 py-0.5 rounded bg-teams-purple/20 text-teams-accent font-medium">
                {user?.presence || 'available'}
              </span>
            </p>
          </div>
        </div>

        {/* User Account Details */}
        <div className="bg-[#1F1F1F] border border-teams-border rounded-2xl p-6 space-y-4 shadow-xl">
          <h3 className="font-bold text-sm text-white uppercase tracking-wider border-b border-teams-border/60 pb-3">
            Account Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3 p-3 bg-[#262626] rounded-xl border border-teams-border/40">
              <Mail className="w-5 h-5 text-teams-purple shrink-0" />
              <div>
                <p className="text-xs text-teams-muted">Work Email</p>
                <p className="font-medium text-white">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-[#262626] rounded-xl border border-teams-border/40">
              <User className="w-5 h-5 text-teams-purple shrink-0" />
              <div>
                <p className="text-xs text-teams-muted">Full Name</p>
                <p className="font-medium text-white">{user?.first_name} {user?.last_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-[#262626] rounded-xl border border-teams-border/40">
              <Building className="w-5 h-5 text-teams-purple shrink-0" />
              <div>
                <p className="text-xs text-teams-muted">Organization Workspace</p>
                <p className="font-medium text-white">Acme Corporation</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-[#262626] rounded-xl border border-teams-border/40">
              <Briefcase className="w-5 h-5 text-teams-purple shrink-0" />
              <div>
                <p className="text-xs text-teams-muted">Department</p>
                <p className="font-medium text-white">Engineering & Product</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
