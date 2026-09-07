import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiClient, getTargetHostUrl, setTargetHostUrl } from '../api/client';
import { setTokens } from '../utils/token';
import { MicroproLogo } from '../components/common/MicroproLogo';
import { ThemeSwitcher } from '../components/common/ThemeSwitcher';
import { Lock, Mail, ArrowRight, Sparkles, Shield, Zap, Eye, EyeOff, Server, CheckCircle, AlertCircle, Loader2, Globe, Settings2, X } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Desktop Server Configuration state
  const [currentServer, setCurrentServer] = useState(getTargetHostUrl());
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [serverInput, setServerInput] = useState(currentServer);
  const [isTestingServer, setIsTestingServer] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [serverTestMsg, setServerTestMsg] = useState('');

  const { fetchMe } = useAuthStore();
  const navigate = useNavigate();

  const handleTestServer = async () => {
    const clean = serverInput.trim().replace(/\/$/, '');
    if (!clean) return;
    setIsTestingServer(true);
    setServerTestResult('idle');
    setServerTestMsg('');
    try {
      const res = await fetch(`${clean}/api/v1/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setServerTestResult('success');
        setServerTestMsg('Server is reachable and healthy!');
      } else {
        setServerTestResult('fail');
        setServerTestMsg(`Server returned status ${res.status}`);
      }
    } catch (e: any) {
      setServerTestResult('fail');
      setServerTestMsg('Could not reach server. Verify host IP/port and network.');
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleSaveServer = () => {
    const clean = serverInput.trim().replace(/\/$/, '');
    if (!clean) return;
    setTargetHostUrl(clean);
    setCurrentServer(clean);
    setIsServerModalOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setIsSubmitting(true);
      const res = await apiClient.post('/auth/login', { email, password });
      const data = res.data.data || res.data;
      if (data.access_token) {
        setTokens(data.access_token, data.refresh_token);
        await fetchMe();
        const redirectUrl = sessionStorage.getItem('mc_redirect_url');
        if (redirectUrl) {
          sessionStorage.removeItem('mc_redirect_url');
          navigate(redirectUrl);
        } else {
          navigate('/');
        }
      } else {
        setError('Login failed: Token not received');
      }
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError(`Unable to connect to backend server at ${currentServer}. Make sure the server is running or click 'Configure Server' below.`);
      } else {
        setError(err.response?.data?.detail || 'Invalid login credentials');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Theme Switcher Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeSwitcher variant="compact" />
      </div>
      {/* Subtle Background Glow Orbs */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl bg-[#11131A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2 z-10">
        
        {/* Left Side: Brand Panel */}
        <div className="p-8 md:p-12 bg-gradient-to-br from-[#171923] to-[#0B0D12] border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between relative overflow-hidden dark-panel">
          <div className="space-y-6 relative z-10">
            {/* Logo Treatment */}
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
                Move work <span className="mc-gradient-text">forward.</span>
              </h2>
              <p className="text-xs md:text-sm text-mc-secondary leading-relaxed">
                Where teams collaborate cleanly — instant messages, meetings, and AI intelligence in one calm space.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex items-center gap-2.5 text-xs text-mc-secondary">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>AI-powered meeting summaries & action items</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-mc-secondary">
                <Shield className="w-4 h-4 text-indigo-400" />
                <span>Enterprise encryption & tenant compliance</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-mc-secondary">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span>Low-latency WebRTC audio & video</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-mc-muted pt-8 relative z-10">
            Micropro_Commute Enterprise Workspace v2.4
          </p>
        </div>

        {/* Right Side: Login Card Form */}
        <div className="p-8 md:p-10 flex flex-col justify-center bg-[#11131A]">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white tracking-tight font-display">Welcome back</h1>
            <p className="text-xs text-mc-muted mt-1">Sign in with your enterprise credentials</p>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs p-3 rounded-xl mb-5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="off"
                  required
                  className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold text-mc-secondary uppercase tracking-wider">
                  Password
                </label>
                <Link to="/forgot-password" className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-mc-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className="w-full bg-[#171923] border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-mc-muted focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
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
              disabled={isSubmitting}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 group active:scale-[0.99] mt-2"
            >
              <span>{isSubmitting ? 'Signing in...' : 'Sign In'}</span>
              {!isSubmitting && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-mc-muted border-t border-white/5 pt-4">
            Need to register a new workspace?{' '}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-semibold ml-1">
              Create Organization
            </Link>
          </div>

          {/* Desktop / Web Server Connection Status & Config */}
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-mc-muted">
            <div className="flex items-center gap-1.5 truncate mr-2">
              <Server className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">Server: <strong className="text-white/80 font-mono text-[10px]">{currentServer}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => {
                setServerInput(currentServer);
                setServerTestResult('idle');
                setServerTestMsg('');
                setIsServerModalOpen(true);
              }}
              className="text-indigo-400 hover:text-indigo-300 font-semibold shrink-0 cursor-pointer hover:underline flex items-center gap-1"
            >
              <Settings2 className="w-3 h-3" />
              <span>Configure</span>
            </button>
          </div>
        </div>

      </div>

      {/* Server Configuration Modal */}
      {isServerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#13151E] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white font-display">Backend Server Address</h3>
              </div>
              <button
                onClick={() => setIsServerModalOpen(false)}
                className="text-mc-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-mc-secondary mb-1.5 uppercase tracking-wider">
                Backend Server URL
              </label>
              <input
                type="text"
                value={serverInput}
                onChange={(e) => {
                  setServerInput(e.target.value);
                  setServerTestResult('idle');
                }}
                placeholder="http://192.168.1.147:8000"
                className="w-full bg-[#0D0F16] border border-white/10 focus:border-indigo-500 text-white text-xs rounded-xl px-3.5 py-2.5 outline-none font-mono"
              />
              <p className="text-[11px] text-mc-muted mt-1.5">
                Enter your backend host. E.g., <code className="text-indigo-400 font-mono">http://192.168.1.147:8000</code> or Cloudflare tunnel.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-mc-muted">Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setServerInput('http://192.168.1.147:8000');
                  setServerTestResult('idle');
                }}
                className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-mono transition-all font-semibold"
              >
                LAN (192.168.1.147:8000)
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerInput('https://outdoors-introduction-commodities-gender.trycloudflare.com');
                  setServerTestResult('idle');
                }}
                className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-mono transition-all font-semibold"
              >
                🔒 Cloudflare Tunnel (HTTPS)
              </button>
            </div>

            {/* Test Connection Feedback */}
            {serverTestResult === 'success' && (
              <div className="flex items-center gap-2 p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 font-medium">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{serverTestMsg}</span>
              </div>
            )}
            {serverTestResult === 'fail' && (
              <div className="flex items-start gap-2 p-2.5 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{serverTestMsg}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleTestServer}
                disabled={isTestingServer || !serverInput.trim()}
                className="flex-1 py-2 rounded-xl border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/10 text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40"
              >
                {isTestingServer ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Testing...</span></>
                ) : (
                  <><Globe className="w-3.5 h-3.5" /><span>Test Connection</span></>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveServer}
                disabled={!serverInput.trim()}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all disabled:opacity-40"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
