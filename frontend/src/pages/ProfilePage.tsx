import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { User, Mail, Building, Briefcase, ArrowLeft, Camera, Sparkles, Check, Upload, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { AVATAR_PRESETS, generateRandomAvatarUrl } from '../utils/avatarPresets';

export const ProfilePage: React.FC = () => {
  const { user, fetchMe } = useAuthStore();
  const navigate = useNavigate();

  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveAvatar = async (newUrl: string) => {
    setAvatarUrl(newUrl);
    try {
      setIsSaving(true);
      await apiClient.put('/users/me', { avatar_url: newUrl });
      await fetchMe();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to update avatar:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Please select an image smaller than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        handleSaveAvatar(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#08090D] text-slate-100 flex flex-col font-sans select-none">
      {/* Top Bar */}
      <div className="h-16 bg-[#0E1017] border-b border-white/[0.08] flex items-center justify-between px-8 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/app/teams')}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-sm text-white font-display">Account & Profile Settings</h1>
            <p className="text-[11px] text-slate-400">Manage identity, personalized avatar, and workspace credentials</p>
          </div>
        </div>

        {savedSuccess && (
          <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold flex items-center gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4" />
            <span>Profile avatar updated</span>
          </div>
        )}
      </div>

      <div className="flex-1 max-w-4xl w-full mx-auto p-8 space-y-6">
        {/* Profile Card Header */}
        <div className="bg-[#0E1017] border border-white/[0.08] rounded-3xl p-6 flex flex-col sm:flex-row items-center gap-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Avatar Container */}
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-3xl overflow-hidden bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex items-center justify-center font-bold text-3xl text-white uppercase shadow-xl shadow-indigo-600/30 border-2 border-white/10">
              {avatarUrl ? (
                <img src={avatarUrl} alt={user?.display_name || 'User Avatar'} className="w-full h-full object-cover" />
              ) : (
                <span>{user?.display_name?.charAt(0) || 'U'}</span>
              )}
            </div>

            <label className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer border border-white/20">
              <Camera className="w-4 h-4" />
              <input type="file" onChange={handleFileSelect} accept="image/*" className="hidden" />
            </label>
          </div>

          <div className="flex-1 text-center sm:text-left min-w-0">
            <h2 className="text-xl font-bold text-white font-display mb-1 truncate">{user?.display_name}</h2>
            <p className="text-xs text-slate-400 flex items-center justify-center sm:justify-start gap-2">
              <span>@{user?.username}</span>
              <span>•</span>
              <span className="capitalize px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-semibold border border-indigo-500/20 text-[11px]">
                {user?.presence || 'available'}
              </span>
            </p>
            <p className="text-xs text-slate-400 mt-2 truncate">{user?.email}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSaveAvatar(generateRandomAvatarUrl())}
              disabled={isSaving}
              className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-xs font-semibold text-indigo-300 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Random Avatar</span>
            </button>
            {avatarUrl && (
              <button
                onClick={() => handleSaveAvatar('')}
                disabled={isSaving}
                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-400 transition-all cursor-pointer"
                title="Reset to Initials"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Curated Preset Avatars Grid */}
        <div className="bg-[#0E1017] border border-white/[0.08] rounded-3xl p-6 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white font-display">Curated Avatar Presets</h3>
              <p className="text-xs text-slate-400">Choose from handcrafted 3D styles, tech bots, and geometric aesthetics</p>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 pt-2">
            {AVATAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleSaveAvatar(preset.url)}
                className={`p-2 rounded-2xl border transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  avatarUrl === preset.url
                    ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/40'
                    : 'bg-[#141722] border-white/5 hover:border-indigo-500/40 hover:bg-white/5'
                }`}
                title={preset.name}
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 shadow-inner">
                  <img src={preset.url} alt={preset.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                </div>
                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[80px]">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* User Account Details */}
        <div className="bg-[#0E1017] border border-white/[0.08] rounded-3xl p-6 space-y-4 shadow-xl">
          <h3 className="font-bold text-sm text-white font-display uppercase tracking-wider border-b border-white/[0.08] pb-3">
            Account Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-3.5 p-3.5 bg-[#141722] rounded-2xl border border-white/5">
              <Mail className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Work Email</p>
                <p className="font-medium text-white">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-3.5 bg-[#141722] rounded-2xl border border-white/5">
              <User className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Full Name</p>
                <p className="font-medium text-white">{user?.first_name} {user?.last_name || user?.display_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-3.5 bg-[#141722] rounded-2xl border border-white/5">
              <Building className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Organization Workspace</p>
                <p className="font-medium text-white">Micropro Commute Enterprise</p>
              </div>
            </div>

            <div className="flex items-center gap-3.5 p-3.5 bg-[#141722] rounded-2xl border border-white/5">
              <Briefcase className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <p className="text-xs text-slate-400">Role & Department</p>
                <p className="font-medium text-white">{user?.job_title || 'Software Engineering'} ({user?.role || 'MEMBER'})</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
