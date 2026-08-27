import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import { Lock, Mail } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { fetchMe } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setIsSubmitting(true);
      const res = await apiClient.post('/auth/login', { email, password });
      const data = res.data.data || res.data;
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        await fetchMe();
        navigate('/');
      } else {
        setError('Login failed: Token not received');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid login credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-4">
      <div className="bg-[#1F1F1F] border border-teams-border rounded-2xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-teams-purple rounded-2xl flex items-center justify-center font-bold text-2xl text-white mx-auto mb-4 shadow-lg">
            T
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to Enterprise Teams</h1>
          <p className="text-xs text-teams-muted mt-1">Enterprise Collaboration Platform</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Work Email
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

          <div>
            <label className="block text-xs font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Password
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-sm rounded-lg shadow-lg disabled:opacity-50 transition-all"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-teams-muted">
          Don't have an enterprise account?{' '}
          <Link to="/register" className="text-teams-accent hover:underline font-semibold">
            Register Organization
          </Link>
        </div>
      </div>
    </div>
  );
};
