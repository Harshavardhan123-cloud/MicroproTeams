import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, getApiErrorMessage } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import { Building, User, Mail, Lock, ArrowRight, Sparkles, Shield, KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { MicroproLogo } from '../components/common/MicroproLogo';
import { ThemeSwitcher } from '../components/common/ThemeSwitcher';

const ORG_PRESETS = [
  'Micropro Software Solutions Private Limited',
  'Micropro Commute Enterprise',
  'Acme Software Solutions',
  'Global Tech Systems',
  '__CUSTOM__'
];

export const RegisterPage: React.FC = () => {
  const [step, setStep] = useState<'DETAILS' | 'OTP'>('DETAILS');
  const [orgOption, setOrgOption] = useState<string>('Micropro Software Solutions Private Limited');
  const [orgName, setOrgName] = useState('Micropro Software Solutions Private Limited');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { fetchMe } = useAuthStore();
  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    try {
      setIsSendingOtp(true);
      const res = await authService.sendOTP(email, 'REGISTER');
      setInfoMsg(res.message || 'OTP verification code sent to your email');
      if (res.dev_otp) {
        setDevOtp(res.dev_otp);
      }
      setStep('OTP');
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Failed to send OTP code'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleRegisterWithOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await authService.register({
        email,
        username,
        password,
        first_name: firstName,
        last_name: lastName,
        organization_name: orgName,
        otp_code: otpCode.trim()
      });

      if (data.access_token) {
        await fetchMe();
        navigate('/');
      } else {
        setError('Registration failed: Token not received');
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Registration failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] flex items-center justify-center p-4 relative overflow-hidden select-none">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl bg-[#11131A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2 z-10">
        
        {/* Left Side: Brand Panel */}
        <div className="p-8 md:p-12 bg-gradient-to-br from-[#171923] to-[#0B0D12] border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between relative overflow-hidden dark-panel">
          <div className="space-y-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <MicroproLogo className="w-9 h-9" />
              </div>
              <span className="font-bold text-lg tracking-tight text-white font-display">
                Micropro<span className="text-indigo-400">_Commute</span>
              </span>
            </div>

            <div className="space-y-2 pt-4">
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight font-display">
                Start moving <span className="mc-gradient-text">together.</span>
              </h2>
              <p className="text-xs md:text-sm text-mc-secondary leading-relaxed">
                Set up your organization workspace with verified email authentication in under 2 minutes.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2.5 text-xs text-mc-secondary">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Custom team channels & workspace security</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-mc-secondary">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>6-Digit Email OTP Encrypted Sign-up</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-mc-muted pt-8 relative z-10">
            Micropro_Commute Enterprise Platform
          </p>
        </div>

        {/* Right Side: Registration Form */}
        <div className="p-8 md:p-10 flex flex-col justify-center bg-[#11131A]">
          <div className="mb-4">
            <h1 className="text-xl font-bold text-white tracking-tight font-display">
              {step === 'DETAILS' ? 'Create Workspace' : 'Verify Email OTP'}
            </h1>
            <p className="text-xs text-mc-muted mt-1">
              {step === 'DETAILS'
                ? 'Register your company and admin account'
                : `Enter the 6-digit OTP code sent to ${email}`}
            </p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {infoMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {devOtp && step === 'OTP' && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs p-3 rounded-xl mb-4 flex items-center justify-between">
              <span>Local Dev OTP Helper:</span>
              <span className="font-mono font-bold tracking-widest text-indigo-200 text-sm bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-500/40">
                {devOtp}
              </span>
            </div>
          )}

          {step === 'DETAILS' ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                  Organization *
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <Building className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted pointer-events-none" />
                    <select
                      value={orgOption}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOrgOption(val);
                        if (val !== '__CUSTOM__') {
                          setOrgName(val);
                        } else {
                          setOrgName('');
                        }
                      }}
                      className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-9 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                    >
                      {ORG_PRESETS.map((preset) => (
                        <option key={preset} value={preset} className="bg-[#171923] text-white">
                          {preset === '__CUSTOM__' ? '+ Create New Organization...' : preset}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-mc-muted pointer-events-none" />
                  </div>

                  {orgOption === '__CUSTOM__' && (
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Enter custom organization name..."
                      required
                      className="w-full bg-[#171923] border border-indigo-500/50 rounded-xl px-3 py-2 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500 animate-in fade-in duration-200"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Alex"
                    required
                    className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Vance"
                    required
                    className="w-full bg-[#171923] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                  Work Email *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@acme.com"
                    required
                    className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                  Username *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="alexv"
                    required
                    className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-3 py-2 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-10 py-2 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-mc-muted hover:text-white transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSendingOtp}
                className="w-full py-2.5 mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 group"
              >
                <span>{isSendingOtp ? 'Sending OTP Code...' : 'Send Verification OTP'}</span>
                {!isSendingOtp && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterWithOtp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                  Enter 6-Digit Email OTP Code *
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                    className="w-full bg-[#171923] border border-indigo-500/40 rounded-xl pl-10 pr-3 py-2.5 text-base font-mono tracking-widest text-white placeholder-mc-muted focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <span>{isSubmitting ? 'Verifying & Registering...' : 'Verify OTP & Create Workspace'}</span>
              </button>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setStep('DETAILS')}
                  className="text-mc-secondary hover:text-white transition-colors"
                >
                  ← Edit Information
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setError('');
                    setInfoMsg('');
                    try {
                      const res = await authService.sendOTP(email, 'REGISTER');
                      setInfoMsg('A new OTP code has been sent to your email.');
                      if (res.dev_otp) setDevOtp(res.dev_otp);
                    } catch (err: any) {
                      setError(getApiErrorMessage(err, 'Resend failed'));
                    }
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Resend OTP
                </button>
              </div>
            </form>
          )}

          <div className="mt-4 text-center text-xs text-mc-muted border-t border-white/5 pt-3">
            Already registered?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold ml-1">
              Sign In
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
};
