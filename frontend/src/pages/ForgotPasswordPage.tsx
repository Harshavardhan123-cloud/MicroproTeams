import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, KeyRound, Lock, CheckCircle2, RefreshCw } from 'lucide-react';
import { authService } from '../services/authService';

export const ForgotPasswordPage: React.FC = () => {
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetSuccess, setIsResetSuccess] = useState(false);

  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    setError(null);
    setInfoMsg(null);
    try {
      const result = await authService.forgotPassword(email);
      setInfoMsg(result.message || 'OTP verification code sent to your email.');
      if (result.dev_otp) {
        setDevOtp(result.dev_otp);
      }
      setStep('OTP');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.detail || 'Failed to send OTP. Please check your email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || !newPassword) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await authService.resetPassword(email, otpCode.trim(), newPassword);
      setIsResetSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.detail || 'Failed to reset password. Check your OTP code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] flex items-center justify-center p-4 relative overflow-hidden select-none">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="bg-[#11131A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-8 relative z-10">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-black text-white text-lg mx-auto mb-3 shadow-lg shadow-indigo-600/30">
            MC
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight font-display">
            {isResetSuccess ? 'Password Reset Complete' : step === 'EMAIL' ? 'Reset Password' : 'Enter Email OTP'}
          </h1>
          <p className="text-xs text-mc-muted mt-1">
            {isResetSuccess
              ? 'Your password has been updated successfully.'
              : step === 'EMAIL'
              ? 'Enter your work email to receive a 6-digit recovery OTP'
              : `Enter the 6-digit OTP code sent to ${email}`}
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {infoMsg && !isResetSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-xl mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {devOtp && step === 'OTP' && !isResetSuccess && (
          <div className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs p-3 rounded-xl mb-4 flex items-center justify-between">
            <span>Local Dev OTP Helper:</span>
            <span className="font-mono font-bold tracking-widest text-indigo-200 text-sm bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-500/40">
              {devOtp}
            </span>
          </div>
        )}

        {isResetSuccess ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-4 rounded-xl text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <p className="font-semibold text-sm">All set!</p>
            <p className="text-mc-secondary">You can now sign in using your new password.</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/25 transition-all mt-2"
            >
              Sign In Now
            </button>
          </div>
        ) : step === 'EMAIL' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1.5">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sbhatt@microproindia.com"
                  required
                  className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Sending Code…' : 'Send Recovery OTP'}
            </button>

            <div className="text-center pt-2">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-mc-muted hover:text-white transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                6-Digit Email OTP Code *
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
                  className="w-full bg-[#171923] border border-indigo-500/40 rounded-xl pl-10 pr-4 py-2.5 text-base font-mono tracking-widest text-white placeholder-mc-muted focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
                New Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Resetting Password…' : 'Reset Password'}
            </button>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setStep('EMAIL')}
                className="text-mc-secondary hover:text-white transition-colors"
              >
                ← Change Email
              </button>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setInfoMsg(null);
                  try {
                    const res = await authService.forgotPassword(email);
                    setInfoMsg('A new OTP code has been sent.');
                    if (res.dev_otp) setDevOtp(res.dev_otp);
                  } catch (err: any) {
                    setError(err?.response?.data?.detail || 'Resend failed');
                  }
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Resend OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
