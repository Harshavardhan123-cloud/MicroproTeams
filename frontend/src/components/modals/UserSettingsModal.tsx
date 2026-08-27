import React, { useState, useEffect } from 'react';
import { X, User, Bell, Palette, Shield, Check, Save, Moon, Sun, Lock, Laptop, Key, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { apiClient } from '../../api/client';

export const UserSettingsModal: React.FC = () => {
  const { isUserSettingsOpen, setUserSettingsOpen } = useUIStore();
  const { user, fetchMe } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'appearance' | 'security'>('profile');

  // Profile Form State
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Notification Preferences State
  const [desktopNotifs, setDesktopNotifs] = useState(() => {
    return localStorage.getItem('teams_desktop_notifs') !== 'false';
  });
  const [soundNotifs, setSoundNotifs] = useState(() => {
    return localStorage.getItem('teams_sound_notifs') !== 'false';
  });
  const [mentionNotifs, setMentionNotifs] = useState(() => {
    return localStorage.getItem('teams_mention_notifs') !== 'false';
  });

  // Appearance State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('teams_theme') as 'dark' | 'light') || 'dark';
  });

  // Password Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // Profile Save State
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setJobTitle(user.job_title || '');
      setDepartment(user.department || '');
      setStatusMessage(user.status_message || '');
    }
  }, [user, isUserSettingsOpen]);

  if (!isUserSettingsOpen) return null;

  // Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      await apiClient.put('/users/me', {
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        job_title: jobTitle,
        department: department,
        status_message: statusMessage
      });
      await fetchMe();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error('Update profile error:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPassword !== confirmPassword) {
      setPwdError('New password and confirm password do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }

    try {
      setIsUpdatingPwd(true);
      await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setPwdSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdSuccess(''), 4000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to update password. Verify your current password.';
      setPwdError(msg);
    } finally {
      setIsUpdatingPwd(false);
    }
  };

  // Theme Switcher Handler
  const handleSelectTheme = (selectedTheme: 'dark' | 'light') => {
    setTheme(selectedTheme);
    localStorage.setItem('teams_theme', selectedTheme);
    if (selectedTheme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  };

  // Notification Toggles Handler
  const handleToggleNotif = (key: string, value: boolean) => {
    if (key === 'desktop') {
      setDesktopNotifs(value);
      localStorage.setItem('teams_desktop_notifs', String(value));
      if (value && 'Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
    } else if (key === 'sound') {
      setSoundNotifs(value);
      localStorage.setItem('teams_sound_notifs', String(value));
    } else if (key === 'mentions') {
      setMentionNotifs(value);
      localStorage.setItem('teams_mention_notifs', String(value));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
      <div className="bg-[#202021] border border-teams-border rounded-2xl w-full max-w-3xl h-[560px] flex overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Left Navigation Sidebar */}
        <div className="w-56 bg-[#181819] border-r border-teams-border p-4 flex flex-col justify-between shrink-0">
          <div>
            <div className="px-3 py-2 mb-4">
              <h2 className="font-bold text-sm text-white">User Settings</h2>
              <p className="text-[11px] text-teams-muted">Preferences & Account</p>
            </div>

            <nav className="space-y-1">
              {[
                { id: 'profile', label: 'Profile & Account', icon: User },
                { id: 'notifications', label: 'Notifications', icon: Bell },
                { id: 'appearance', label: 'Appearance', icon: Palette },
                { id: 'security', label: 'Privacy & Security', icon: Shield },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-teams-purple/20 text-white border border-teams-purple/40 shadow-sm'
                        : 'text-teams-muted hover:bg-teams-hover hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-teams-purple' : ''}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 bg-[#242426] border border-teams-border/60 rounded-xl text-center">
            <p className="text-[10px] font-bold text-white">MicroproTeams v2.4</p>
            <p className="text-[9px] text-teams-muted">Enterprise Secured Session</p>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 flex flex-col h-full bg-[#202021]">
          {/* Header */}
          <div className="h-14 border-b border-teams-border flex items-center justify-between px-6 shrink-0">
            <h3 className="font-bold text-sm text-white capitalize">{activeTab} Settings</h3>
            <button
              onClick={() => setUserSettingsOpen(false)}
              className="p-1.5 text-teams-muted hover:text-white rounded-lg hover:bg-teams-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content Scroll View */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* 1. Profile Tab */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                <div className="flex items-center gap-4 p-4 bg-[#181819] rounded-xl border border-teams-border/60 mb-4">
                  <div className="w-14 h-14 rounded-full bg-teams-purple flex items-center justify-center font-bold text-xl text-white uppercase shadow-lg ring-2 ring-white/10">
                    {user?.display_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">{user?.display_name}</h4>
                    <p className="text-xs text-teams-muted">{user?.email}</p>
                    <span className="inline-block text-[10px] px-2 py-0.5 mt-1 rounded bg-teams-purple/20 text-teams-accent font-semibold uppercase">
                      Enterprise Member
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-teams-muted uppercase tracking-wider mb-1">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-[#181819] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-teams-muted uppercase tracking-wider mb-1">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-[#181819] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teams-muted uppercase tracking-wider mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-[#181819] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-teams-muted uppercase tracking-wider mb-1">Job Title</label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior Engineer"
                      className="w-full bg-[#181819] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-teams-muted uppercase tracking-wider mb-1">Department</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Engineering"
                      className="w-full bg-[#181819] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-teams-muted uppercase tracking-wider mb-1">Status Message</label>
                  <input
                    type="text"
                    value={statusMessage}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    placeholder="What's on your mind today?"
                    className="w-full bg-[#181819] border border-teams-border rounded-lg px-3 py-2 text-xs text-white focus:border-teams-purple focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-5 py-2 bg-teams-purple hover:bg-teams-purple-hover text-white text-xs font-bold rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isSavingProfile ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>Save Profile Changes</span>
                  </button>
                  {profileSuccess && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 animate-in fade-in">
                      <Check className="w-4 h-4" /> Profile updated successfully!
                    </span>
                  )}
                </div>
              </form>
            )}

            {/* 2. Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-4 max-w-lg">
                <p className="text-xs text-teams-muted mb-2">Configure how and when you receive workspace alerts.</p>
                {[
                  { id: 'desktop', label: 'Desktop Toast Notifications', desc: 'Display popups for incoming direct messages & calls', value: desktopNotifs },
                  { id: 'sound', label: 'Notification Audio Ringers', desc: 'Play incoming sound effect when called or mentioned', value: soundNotifs },
                  { id: 'mentions', label: '@Everyone & Channel Mentions', desc: 'Alert when highlighted in team channels', value: mentionNotifs },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3.5 bg-[#181819] rounded-xl border border-teams-border/60">
                    <div>
                      <p className="text-xs font-bold text-white">{item.label}</p>
                      <p className="text-[11px] text-teams-muted mt-0.5">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={item.value}
                      onChange={(e) => handleToggleNotif(item.id, e.target.checked)}
                      className="w-4 h-4 accent-teams-purple cursor-pointer rounded"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 3. Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-lg">
                <p className="text-xs text-teams-muted mb-2">Select your preferred application color theme.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => handleSelectTheme('dark')}
                    className={`p-4 bg-[#181819] border-2 rounded-xl cursor-pointer transition-all ${
                      theme === 'dark' ? 'border-teams-purple ring-2 ring-teams-purple/40' : 'border-teams-border/60'
                    }`}
                  >
                    <Moon className="w-5 h-5 text-teams-purple mb-2" />
                    <p className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Dark Theme</span>
                      {theme === 'dark' && <Check className="w-4 h-4 text-teams-purple" />}
                    </p>
                    <p className="text-[10px] text-teams-muted mt-1">Sleek dark mode for low-light environments</p>
                  </div>

                  <div
                    onClick={() => handleSelectTheme('light')}
                    className={`p-4 bg-[#181819] border-2 rounded-xl cursor-pointer transition-all ${
                      theme === 'light' ? 'border-teams-purple ring-2 ring-teams-purple/40' : 'border-teams-border/60'
                    }`}
                  >
                    <Sun className="w-5 h-5 text-amber-400 mb-2" />
                    <p className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Light Theme</span>
                      {theme === 'light' && <Check className="w-4 h-4 text-teams-purple" />}
                    </p>
                    <p className="text-[10px] text-teams-muted mt-1">High clarity light background palette</p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. Privacy & Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6 max-w-lg">
                {/* Change Password Form */}
                <form onSubmit={handleChangePassword} className="p-4 bg-[#181819] border border-teams-border/60 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs text-white border-b border-teams-border/60 pb-2">
                    <Key className="w-4 h-4 text-teams-purple" />
                    <span>Change Account Password</span>
                  </div>

                  {pwdError && (
                    <div className="p-2 bg-red-500/15 border border-red-500/30 rounded text-xs text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{pwdError}</span>
                    </div>
                  )}

                  {pwdSuccess && (
                    <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded text-xs text-emerald-400 flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{pwdSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-teams-muted uppercase tracking-wider mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full bg-[#202021] border border-teams-border rounded-lg px-3 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-teams-muted uppercase tracking-wider mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full bg-[#202021] border border-teams-border rounded-lg px-3 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-teams-muted uppercase tracking-wider mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full bg-[#202021] border border-teams-border rounded-lg px-3 py-1.5 text-xs text-white focus:border-teams-purple focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdatingPwd}
                    className="mt-2 px-4 py-2 bg-teams-purple hover:bg-teams-purple-hover text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isUpdatingPwd ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>Update Password</span>
                  </button>
                </form>

                {/* Active Session Info */}
                <div className="p-4 bg-[#181819] border border-teams-border/60 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-white">
                    <Laptop className="w-4 h-4 text-emerald-400" />
                    <span>Active Login Session</span>
                  </div>
                  <p className="text-[11px] text-teams-muted">Linux Chrome • Active Session • IP 127.0.0.1 (Current Device)</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
