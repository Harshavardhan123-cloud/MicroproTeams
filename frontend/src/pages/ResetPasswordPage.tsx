import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    setMessage('Password reset successfully! Redirecting...');
    setTimeout(() => navigate('/login'), 1500);
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-4">
      <div className="bg-[#1F1F1F] border border-teams-border rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-teams-purple rounded-2xl flex items-center justify-center font-bold text-2xl text-white mx-auto mb-4 shadow-lg">
            T
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Set New Password</h1>
          <p className="text-xs text-teams-muted mt-1">Please enter your new enterprise account password</p>
        </div>

        {message && (
          <div className="bg-teams-purple/20 border border-teams-purple/40 text-teams-accent text-xs p-3 rounded-lg mb-4 text-center">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-sm rounded-lg shadow-lg transition-all"
          >
            Update Password & Sign In
          </button>

          <div className="text-center pt-2">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-teams-muted hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
