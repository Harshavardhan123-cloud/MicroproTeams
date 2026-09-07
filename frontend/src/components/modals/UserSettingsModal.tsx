import React, { useState, useEffect, useRef } from 'react';
import { X, User, Bell, Palette, Shield, Check, Save, Moon, Sun, Lock, Laptop, Key, RefreshCw, AlertCircle, Volume2, Video, Mic, Camera, Upload, Trash2, MoonStar, Sparkles, Play, Square, Music } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { apiClient } from '../../api/client';
import { authService } from '../../services/authService';
import { ThemeSwitcher } from '../common/ThemeSwitcher';
import { notificationOrchestrator } from '../../services/notificationOrchestrator';
import { NotificationPreferences } from '../../types/notification';
import { ringtoneManager, RINGTONE_PRESETS } from '../../utils/ringtoneManager';
import { AVATAR_PRESETS, generateRandomAvatarUrl } from '../../utils/avatarPresets';

export const UserSettingsModal: React.FC = () => {
  const { isUserSettingsOpen, setUserSettingsOpen } = useUIStore();
  const { user, fetchMe } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'profile' | 'devices' | 'notifications' | 'appearance' | 'security'>('profile');

  // Profile Form State
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Device Preferences State
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedMic, setSelectedMic] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
  const [autoMuteOnJoin, setAutoMuteOnJoin] = useState(() => localStorage.getItem('mc_auto_mute') === 'true');
  const [hdVideo, setHdVideo] = useState(() => localStorage.getItem('mc_hd_video') !== 'false');

  // Notification & Privacy Preferences State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(() => notificationOrchestrator.getPreferences());
  const [readReceipts, setReadReceipts] = useState(() => localStorage.getItem('mc_read_receipts') !== 'false');

  const updateNotifPref = (key: keyof NotificationPreferences, value: any) => {
    const updated = notificationOrchestrator.savePreferences({ [key]: value });
    setNotifPrefs(updated);
    if (key === 'enableDesktopNotifs' && value && typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  };

  // Ringtone State & Handlers
  const [selectedRingtone, setSelectedRingtone] = useState<string>(() => ringtoneManager.getSelectedRingtone());
  const [ringtoneVolume, setRingtoneVolume] = useState<number>(() => ringtoneManager.getVolume());
  const [isPreviewingRingtone, setIsPreviewingRingtone] = useState(false);

  const handlePreviewRingtone = (presetId?: string) => {
    const id = presetId || selectedRingtone;
    if (isPreviewingRingtone) {
      ringtoneManager.stopPreview();
      ringtoneManager.stop();
      setIsPreviewingRingtone(false);
    } else {
      setIsPreviewingRingtone(true);
      ringtoneManager.previewRingtone(id);
      setTimeout(() => setIsPreviewingRingtone(false), 3000);
    }
  };

  const handleChangeRingtone = (presetId: string) => {
    setSelectedRingtone(presetId);
    ringtoneManager.setSelectedRingtone(presetId);
    ringtoneManager.previewRingtone(presetId);
    setIsPreviewingRingtone(true);
    setTimeout(() => setIsPreviewingRingtone(false), 2200);
  };

  const handleVolumeChange = (newVol: number) => {
    setRingtoneVolume(newVol);
    ringtoneManager.setVolume(newVol);
  };

  // Appearance State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('mc_theme') as 'dark' | 'light') || 'dark');

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [otpSentMsg, setOtpSentMsg] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  // Profile Save State
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setAvatarUrl(user.avatar_url || '');
      setJobTitle(user.job_title || '');
      setDepartment(user.department || '');
      setStatusMessage(user.status_message || '');
    }
  }, [user, isUserSettingsOpen]);

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Please select an image file smaller than 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAvatarUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Load Media Devices
  useEffect(() => {
    if (isUserSettingsOpen) {
      navigator.mediaDevices?.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        const audioOutputs = devices.filter((d) => d.kind === 'audiooutput');

        setCameras(videoInputs);
        setMics(audioInputs);
        setSpeakers(audioOutputs);

        if (videoInputs.length && !selectedCamera) setSelectedCamera(videoInputs[0].deviceId);
        if (audioInputs.length && !selectedMic) setSelectedMic(audioInputs[0].deviceId);
        if (audioOutputs.length && !selectedSpeaker) setSelectedSpeaker(audioOutputs[0].deviceId);
      }).catch(err => console.warn('Enumerate devices warning:', err));
    }
  }, [isUserSettingsOpen]);

  if (!isUserSettingsOpen) return null;

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      await apiClient.put('/users/me', {
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
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

  // Send OTP for Password Change
  const handleSendChangePasswordOTP = async () => {
    if (!user?.email) return;
    setPwdError('');
    setOtpSentMsg('');
    try {
      setIsSendingOtp(true);
      const res = await authService.sendOTP(user.email, 'CHANGE_PASSWORD');
      setOtpSentMsg(res.message || 'OTP verification code sent to your email.');
      if (res.dev_otp) setDevOtp(res.dev_otp);
    } catch (err: any) {
      setPwdError(err.response?.data?.detail || err.response?.data?.error?.message || 'Failed to send OTP to email.');
    } finally {
      setIsSendingOtp(false);
    }
  };


  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (!otpCode.trim()) {
      setPwdError('Please enter the 6-digit OTP code sent to your email.');
      return;
    }
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
      await authService.changePassword(currentPassword, newPassword, otpCode.trim());
      setPwdSuccess('Password updated successfully!');
      setCurrentPassword('');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setOtpSentMsg('');
      setDevOtp(null);
      setTimeout(() => setPwdSuccess(''), 4000);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.response?.data?.error?.message || 'Failed to update password. Verify current password and OTP code.';
      setPwdError(msg);
    } finally {
      setIsUpdatingPwd(false);
    }
  };


  // Theme Handler
  const handleSelectTheme = (selectedTheme: 'dark' | 'light') => {
    setTheme(selectedTheme);
    localStorage.setItem('mc_theme', selectedTheme);
  };

  // Toggle Notification Handlers
  const handleToggleNotif = (key: string, value: boolean) => {
    if (key === 'desktop') {
      updateNotifPref('enableDesktopNotifs', value);
      updateNotifPref('enableBrowserNotifs', value);
    } else if (key === 'sound') {
      updateNotifPref('enableSound', value);
    } else if (key === 'mentions') {
      updateNotifPref('enableMentions', value);
    } else if (key === 'read_receipts') {
      setReadReceipts(value);
      localStorage.setItem('mc_read_receipts', String(value));
      window.dispatchEvent(new Event('storage'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[9999] p-4 select-none">
      <div className="bg-[#0B0D12] border border-white/10 rounded-2xl w-full max-w-4xl h-[600px] flex overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        
        {/* Left Navigation Sidebar */}
        <div className="w-60 bg-[#11131A] border-r border-white/5 p-4 flex flex-col justify-between shrink-0">
          <div>
            <div className="px-3 py-2 mb-4">
              <h2 className="font-bold text-sm text-white font-display">Workspace Preferences</h2>
              <p className="text-[11px] text-mc-muted">Profile & Platform Configuration</p>
            </div>

            <nav className="space-y-1">
              {[
                { id: 'profile', label: 'Profile & Account', icon: User },
                { id: 'devices', label: 'Audio & Video Devices', icon: Video },
                { id: 'notifications', label: 'Notifications & Alerts', icon: Bell },
                { id: 'appearance', label: 'Appearance & Theme', icon: Palette },
                { id: 'security', label: 'Privacy & Security', icon: Shield },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'text-mc-muted hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-3 bg-[#171923] border border-white/5 rounded-xl text-center">
            <p className="text-[11px] font-bold text-white font-display">Micropro_Commute v3.0</p>
            <p className="text-[9px] text-mc-muted">Enterprise Secured Workspace</p>
          </div>
        </div>

        {/* Main Content Body */}
        <div className="flex-1 flex flex-col h-full bg-[#0B0D12]">
          {/* Header */}
          <div className="h-14 border-b border-white/5 bg-[#11131A] flex items-center justify-between px-6 shrink-0">
            <h3 className="font-bold text-sm text-white font-display capitalize">{activeTab} Settings</h3>
            <button
              onClick={() => setUserSettingsOpen(false)}
              className="p-1.5 text-mc-muted hover:text-white rounded-xl hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content Scroll View */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* 1. Profile Tab */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-4 max-w-xl">
                <div className="flex items-center gap-5 p-4 bg-[#11131A] rounded-2xl border border-white/5 mb-4">
                  {/* Interactive Avatar Image */}
                  <div className="relative group shrink-0">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-2xl text-white uppercase shadow-lg shadow-indigo-600/30 border-2 border-white/10">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={user?.display_name || 'Avatar'} className="w-full h-full object-cover" />
                      ) : (
                        <span>{user?.display_name?.charAt(0) || 'U'}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer border border-white/20"
                      title="Upload photo"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </button>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleAvatarFileSelect}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-white font-display truncate">{user?.display_name}</h4>
                        <p className="text-xs text-mc-muted truncate">{user?.email}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-xl text-xs font-semibold text-indigo-300 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Image</span>
                        </button>

                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => setAvatarUrl('')}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-400 transition-all cursor-pointer"
                            title="Remove picture"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <span className="inline-block text-[10px] px-2.5 py-0.5 mt-2 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/20 font-bold uppercase tracking-wider">
                      {user?.role || 'ORGANIZATION MEMBER'}
                    </span>
                  </div>
                </div>

                {/* Curated Avatar Preset Gallery & Generator */}
                <div className="p-3.5 bg-[#11131A] rounded-2xl border border-white/5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white font-display">Avatar Gallery & Generator</p>
                      <p className="text-[11px] text-mc-muted">Select a curated 3D avatar or generate a random persona</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvatarUrl(generateRandomAvatarUrl())}
                      className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-[11px] font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer"
                      title="Generate fresh unique avatar"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Randomize</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-6 gap-2 pt-1">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setAvatarUrl(preset.url)}
                        className={`group relative p-1 rounded-xl border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          avatarUrl === preset.url
                            ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/40'
                            : 'bg-[#171923] border-white/5 hover:border-indigo-500/40 hover:bg-white/5'
                        }`}
                        title={preset.name}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/40">
                          <img src={preset.url} alt={preset.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                        </div>
                        <span className="text-[9px] text-mc-muted truncate max-w-[50px]">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Job Title</label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="e.g. Senior Software Architect"
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Department</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Engineering & Product"
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Custom Status</label>
                  <input
                    type="text"
                    value={statusMessage}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    placeholder="Focusing on Micropro_Commute Release..."
                    className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
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

            {/* 2. Audio & Video Devices Tab */}
            {activeTab === 'devices' && (
              <div className="space-y-4 max-w-xl">
                <p className="text-xs text-mc-muted mb-2">Configure camera, microphone, and audio output settings for meetings.</p>
                
                <div className="space-y-3 p-4 bg-[#11131A] rounded-2xl border border-white/5">
                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-indigo-400" /> Camera Input Device
                    </label>
                    <select
                      value={selectedCamera}
                      onChange={(e) => setSelectedCamera(e.target.value)}
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      {cameras.length === 0 ? (
                        <option value="">Default Web Camera</option>
                      ) : (
                        cameras.map((c) => (
                          <option key={c.deviceId} value={c.deviceId}>
                            {c.label || `Camera (${c.deviceId.slice(0, 8)})`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-indigo-400" /> Microphone Input Device
                    </label>
                    <select
                      value={selectedMic}
                      onChange={(e) => setSelectedMic(e.target.value)}
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      {mics.length === 0 ? (
                        <option value="">Default Microphone</option>
                      ) : (
                        mics.map((m) => (
                          <option key={m.deviceId} value={m.deviceId}>
                            {m.label || `Microphone (${m.deviceId.slice(0, 8)})`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Speaker Output Device
                    </label>
                    <select
                      value={selectedSpeaker}
                      onChange={(e) => setSelectedSpeaker(e.target.value)}
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      {speakers.length === 0 ? (
                        <option value="">System Default Speaker</option>
                      ) : (
                        speakers.map((s) => (
                          <option key={s.deviceId} value={s.deviceId}>
                            {s.label || `Speaker (${s.deviceId.slice(0, 8)})`}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="space-y-2 p-4 bg-[#11131A] rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white font-display">Auto-Mute Microphone on Join</p>
                      <p className="text-[11px] text-mc-muted">Start meetings with your microphone muted automatically.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoMuteOnJoin}
                      onChange={(e) => {
                        setAutoMuteOnJoin(e.target.checked);
                        localStorage.setItem('mc_auto_mute', String(e.target.checked));
                      }}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div>
                      <p className="text-xs font-bold text-white font-display">Enable High Definition (HD) Video</p>
                      <p className="text-[11px] text-mc-muted">Transmit 1080p video stream in supported meeting bandwidth conditions.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={hdVideo}
                      onChange={(e) => {
                        setHdVideo(e.target.checked);
                        localStorage.setItem('mc_hd_video', String(e.target.checked));
                      }}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-4 max-w-xl">
                <p className="text-xs text-mc-muted mb-2">Configure how and when you receive real-time enterprise alerts.</p>

                {/* System Permission Banner */}
                <div className="p-4 bg-[#11131A] rounded-2xl border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white font-display">OS System Notification Permission</p>
                    <p className="text-[11px] text-mc-muted mt-0.5">
                      Permission Status: <span className="font-semibold text-indigo-400 capitalize">{typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'Not Supported'}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof window !== 'undefined' && 'Notification' in window) {
                        const perm = await Notification.requestPermission();
                        if (perm === 'granted') {
                          updateNotifPref('enableDesktopNotifs', true);
                          updateNotifPref('enableBrowserNotifs', true);
                        }
                        setActiveTab('notifications');
                      }
                    }}
                    className="px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-bold transition-all"
                  >
                    Request Permission
                  </button>
                </div>

                {/* Incoming Call Ringtone & Audio Alerts Card */}
                <div className="p-4 bg-[#11131A] rounded-2xl border border-white/5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Music className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white font-display">Call Ringtone & Audio Melodies</p>
                        <p className="text-[11px] text-mc-muted">Select an incoming call chime and adjust ringtone volume</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePreviewRingtone()}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                        isPreviewingRingtone
                          ? 'bg-rose-600 text-white shadow-rose-600/30 animate-pulse'
                          : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30'
                      }`}
                      title={isPreviewingRingtone ? 'Stop Preview' : 'Test Ringtone'}
                    >
                      {isPreviewingRingtone ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{isPreviewingRingtone ? 'Stop' : 'Play Test'}</span>
                    </button>
                  </div>

                  {/* Ringtone Selection Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {RINGTONE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleChangeRingtone(preset.id)}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          selectedRingtone === preset.id
                            ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/30'
                            : 'bg-[#171923] border-white/5 hover:border-white/15 hover:bg-white/5'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-white font-display truncate">{preset.name}</p>
                          <p className="text-[10px] text-mc-muted truncate">{preset.description}</p>
                        </div>
                        {selectedRingtone === preset.id && (
                          <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0 shadow-lg shadow-indigo-500/50" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Volume Slider */}
                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-mc-muted flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5 text-indigo-400" /> Ringtone Volume
                      </label>
                      <span className="text-[11px] font-bold text-white">{Math.round(ringtoneVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={ringtoneVolume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-[#171923] rounded-lg"
                    />
                  </div>
                </div>

                {/* Do Not Disturb (DND) Card */}
                <div className="p-4 bg-[#11131A] rounded-2xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MoonStar className="w-4 h-4 text-amber-400" />
                      <div>
                        <p className="text-xs font-bold text-white font-display">Do Not Disturb (DND)</p>
                        <p className="text-[11px] text-mc-muted">Mute non-urgent notifications during scheduled hours</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.dndEnabled}
                      onChange={(e) => updateNotifPref('dndEnabled', e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                    />
                  </div>

                  {notifPrefs.dndEnabled && (
                    <div className="pt-3 border-t border-white/5 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">DND Start Time</label>
                          <input
                            type="time"
                            value={notifPrefs.dndStartTime || '22:00'}
                            onChange={(e) => updateNotifPref('dndStartTime', e.target.value)}
                            className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">DND End Time</label>
                          <input
                            type="time"
                            value={notifPrefs.dndEndTime || '07:00'}
                            onChange={(e) => updateNotifPref('dndEndTime', e.target.value)}
                            className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="text-xs font-bold text-white font-display">Allow Incoming Calls During DND</p>
                          <p className="text-[11px] text-mc-muted">Urgent audio/video calls will still ring during quiet hours</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={notifPrefs.allowCallsInDnd}
                          onChange={(e) => updateNotifPref('allowCallsInDnd', e.target.checked)}
                          className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Delivery Channels */}
                <div className="p-4 bg-[#11131A] rounded-2xl border border-white/5 space-y-3">
                  <p className="text-xs font-bold text-white font-display">Notification Channels</p>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white font-semibold">Native Desktop / OS Alerts</p>
                      <p className="text-[11px] text-mc-muted">Windows Toast / Linux D-Bus / macOS Notification Center</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.enableDesktopNotifs}
                      onChange={(e) => updateNotifPref('enableDesktopNotifs', e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div>
                      <p className="text-xs text-white font-semibold">Notification Sound Effects & Ringers</p>
                      <p className="text-[11px] text-mc-muted">Play call ringtones and instant message audio chimes</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifPrefs.enableSound}
                      onChange={(e) => updateNotifPref('enableSound', e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                    />
                  </div>
                </div>

                {/* Event Category Preferences */}
                <div className="p-4 bg-[#11131A] rounded-2xl border border-white/5 space-y-3">
                  <p className="text-xs font-bold text-white font-display">Notification Categories</p>

                  {[
                    { key: 'enableCalls', label: 'Audio & Video Calls', desc: 'Incoming direct call requests & invitations' },
                    { key: 'enableMessages', label: 'Direct Messages', desc: 'Chat messages received in 1-on-1 conversations' },
                    { key: 'enableMentions', label: '@Mentions & Tags', desc: 'When your handle or @everyone is tagged in channels' },
                    { key: 'enableMeetings', label: 'Meetings & Calendar Events', desc: 'Scheduled meeting start alerts & invitations' },
                    { key: 'enableFiles', label: 'File Share Alerts', desc: 'When documents or files are shared with you' },
                    { key: 'enableSystem', label: 'System & Security Alerts', desc: 'Important workspace notifications' },
                  ].map((cat) => (
                    <div key={cat.key} className="flex items-center justify-between pt-2 first:pt-0 border-t first:border-t-0 border-white/5">
                      <div>
                        <p className="text-xs text-white font-semibold">{cat.label}</p>
                        <p className="text-[11px] text-mc-muted">{cat.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(notifPrefs[cat.key as keyof NotificationPreferences])}
                        onChange={(e) => updateNotifPref(cat.key as keyof NotificationPreferences, e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                      />
                    </div>
                  ))}
                </div>

                {/* Read Receipts */}
                <div className="flex items-center justify-between p-4 bg-[#11131A] rounded-2xl border border-white/5">
                  <div>
                    <p className="text-xs font-bold text-white font-display">Message Read Receipts</p>
                    <p className="text-[11px] text-mc-muted mt-0.5">Show read indicators in chat conversations</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={readReceipts}
                    onChange={(e) => {
                      setReadReceipts(e.target.checked);
                      localStorage.setItem('mc_read_receipts', String(e.target.checked));
                      window.dispatchEvent(new Event('storage'));
                    }}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer rounded"
                  />
                </div>
              </div>
            )}

            {/* 4. Appearance Tab */}
            {activeTab === 'appearance' && (
              <div className="space-y-4 max-w-xl">
                <p className="text-xs text-mc-muted mb-2">Select your preferred platform visual appearance or use Auto Day/Night sync.</p>
                <ThemeSwitcher variant="cards" />
              </div>
            )}

            {/* 5. Privacy & Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6 max-w-xl">
                {/* Change Password Form */}
                <form onSubmit={handleChangePassword} className="p-4 bg-[#11131A] border border-white/5 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs text-white border-b border-white/5 pb-2 font-display">
                    <Key className="w-4 h-4 text-indigo-400" />
                    <span>Change Account Password</span>
                  </div>

                  {pwdError && (
                    <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{pwdError}</span>
                    </div>
                  )}

                  {otpSentMsg && (
                    <div className="p-2.5 bg-indigo-500/15 border border-indigo-500/30 rounded-xl text-xs text-indigo-300 flex items-center justify-between">
                      <span>{otpSentMsg}</span>
                      {devOtp && (
                        <span className="font-mono font-bold text-indigo-200 bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-500/40 ml-2 shrink-0">
                          OTP: {devOtp}
                        </span>
                      )}
                    </div>
                  )}

                  {pwdSuccess && (
                    <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{pwdSuccess}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                      className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider">
                        6-Digit Email Verification OTP *
                      </label>
                      <button
                        type="button"
                        onClick={handleSendChangePasswordOTP}
                        disabled={isSendingOtp}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSendingOtp ? 'animate-spin' : ''}`} />
                        <span>{isSendingOtp ? 'Sending OTP...' : 'Send OTP to Email'}</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter 6-digit OTP code"
                      required
                      className="w-full bg-[#171923] border border-indigo-500/30 rounded-xl px-3 py-2 text-xs font-mono tracking-widest text-white focus:border-indigo-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-mc-muted uppercase tracking-wider mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isUpdatingPwd}
                    className="mt-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isUpdatingPwd ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>Update Password with OTP</span>
                  </button>
                </form>

                {/* Active Session Info */}
                <div className="p-4 bg-[#11131A] border border-white/5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-white font-display">
                    <Laptop className="w-4 h-4 text-emerald-400" />
                    <span>Active Security Session</span>
                  </div>
                  <p className="text-[11px] text-mc-muted">Linux Chrome Client • Active Session • IP 127.0.0.1 (Current Device)</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
