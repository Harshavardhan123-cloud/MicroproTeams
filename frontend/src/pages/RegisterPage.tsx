import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/client';
import { Building, User, Mail, Lock } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { fetchMe } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setIsSubmitting(true);
      const res = await apiClient.post('/auth/register', {
        email,
        username,
        password,
        first_name: firstName,
        last_name: lastName,
        organization_name: orgName
      });
      const data = res.data.data || res.data;
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        await fetchMe();
        navigate('/');
      } else {
        setError('Registration failed: Token not received');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] flex items-center justify-center p-4">
      <div className="bg-[#1F1F1F] border border-teams-border rounded-2xl shadow-2xl w-full max-w-lg p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-teams-purple rounded-xl flex items-center justify-center font-bold text-xl text-white mx-auto mb-3 shadow-lg">
            T
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Create Enterprise Workspace</h1>
          <p className="text-xs text-teams-muted mt-1">Setup your organization and admin user</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Organization Name *
            </label>
            <div className="relative">
              <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Corporation"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-teams-muted uppercase tracking-wider mb-1">
                First Name *
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alex"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg px-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-teams-muted uppercase tracking-wider mb-1">
                Last Name *
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Vance"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg px-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Work Email *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@acme.com"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Username *
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                placeholder="alexv"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-teams-muted uppercase tracking-wider mb-1">
              Password *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teams-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-[#282828] border border-teams-border rounded-lg pl-9 pr-3 py-2 text-sm text-teams-text focus:outline-none focus:border-teams-purple"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 mt-2 bg-teams-purple hover:bg-teams-purple-hover text-white font-semibold text-sm rounded-lg shadow-lg disabled:opacity-50 transition-all"
          >
            {isSubmitting ? 'Creating Organization...' : 'Register & Create Workspace'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-teams-muted">
          Already registered?{' '}
          <Link to="/login" className="text-teams-accent hover:underline font-semibold">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
