import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-4">
      <div className="bg-[#1F1F1F] border border-teams-border rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-teams-purple rounded-2xl flex items-center justify-center font-bold text-2xl text-white mx-auto mb-4 shadow-lg">
            T
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Reset Password</h1>
          <p className="text-xs text-teams-muted mt-1">
            Enter your enterprise email to receive reset instructions
          </p>
        </div>

        {submitted ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-4 rounded-lg text-center space-y-2">
            <p className="font-semibold text-sm">Password Reset Email Sent!</p>
            <p>If an account exists for {email}, you will receive a reset link shortly.</p>
            <Link to="/login" className="inline-flex items-center gap-1.5 text-teams-purple hover:underline pt-2 font-semibold">
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-sm rounded-lg shadow-lg transition-all"
            >
              Send Reset Instructions
            </button>

            <div className="text-center pt-2">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-teams-muted hover:text-white transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
