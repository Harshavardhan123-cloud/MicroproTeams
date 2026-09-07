import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { authService } from '../services/authService';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const emailParam = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailParam);
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !otpCode.trim()) {
      setIsError(true);
      setMessage('Please enter your registered email address and 6-digit OTP code.');
      return;
    }
    if (password !== confirmPassword) {
      setIsError(true);
      setMessage('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    setIsError(false);
    try {
      await authService.resetPassword(email.trim(), otpCode.trim(), password);
      setMessage('Password reset successfully! Redirecting to sign in...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setIsError(true);
      setMessage(err?.response?.data?.detail || err?.response?.data?.error?.message || 'Invalid or expired OTP code.');
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
          <h1 className="text-xl font-bold text-white tracking-tight font-display">Set New Password</h1>
          <p className="text-xs text-mc-muted mt-1">Verify your 6-digit email OTP and choose a new password</p>
        </div>

        {message && (
          <div
            className={`text-xs p-3 rounded-xl mb-4 text-center border ${
              isError
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
              Work Email Address *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@acme.com"
                required
                className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1">
              Confirm New Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
            {isSubmitting ? 'Updating…' : 'Update Password & Sign In'}
          </button>

          <div className="text-center pt-2">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-mc-muted hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
