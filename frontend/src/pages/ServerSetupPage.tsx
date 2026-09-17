import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, ArrowRight, CheckCircle, AlertCircle, Loader2, Globe } from 'lucide-react';

export const ServerSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [serverUrl, setServerUrl] = useState(
    localStorage.getItem('electron_server_url') || 'http://localhost:8000'
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const testConnection = async () => {
    setTesting(true);
    setTestResult('idle');
    setErrorMsg('');
    try {
      const clean = serverUrl.replace(/\/$/, '');
      const res = await fetch(`${clean}/api/v1/health`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        setTestResult('success');
      } else {
        setTestResult('fail');
        setErrorMsg(`Server responded with status ${res.status}`);
      }
    } catch (e: any) {
      setTestResult('fail');
      setErrorMsg('Could not reach server. Check the IP address and ensure backend is running.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const clean = serverUrl.trim().replace(/\/$/, '');
    localStorage.setItem('electron_server_url', clean);
    navigate('/login');
  };

  return (
    <div className="h-screen w-screen bg-[#0D0F16] flex items-center justify-center select-none overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-600/40 mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Server Configuration</h1>
          <p className="text-sm text-slate-400 mt-1 text-center">
            Enter your Micropro_Commute backend server address
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#13151E] border border-white/10 rounded-2xl p-6 shadow-2xl">
          <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
            Backend Server URL
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => {
              setServerUrl(e.target.value);
              setTestResult('idle');
            }}
            placeholder="http://localhost:8000"
            className="w-full bg-[#0D0F16] border border-white/10 focus:border-indigo-500 text-white text-sm rounded-xl px-4 py-3 outline-none transition-all font-mono"
          />

          <p className="text-[11px] text-slate-500 mt-2">
            This is the address of the backend. Default: <span className="text-indigo-400 font-mono">http://localhost:8000</span> or Cloudflare tunnel.
          </p>

          {/* Quick presets */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-[11px] text-slate-500">Quick:</span>
            <button
              onClick={() => { setServerUrl('http://localhost:8000'); setTestResult('idle'); }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-mono transition-all font-semibold"
            >
              Local (localhost:8000)
            </button>
            <button
              onClick={() => { setServerUrl('https://violin-providers-entries-content.trycloudflare.com'); setTestResult('idle'); }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-mono transition-all font-semibold"
            >
              🔒 Cloudflare Tunnel
            </button>
          </div>

          {/* Test Result Banner */}
          {testResult === 'success' && (
            <div className="mt-4 flex items-center gap-2.5 p-3 bg-emerald-950/50 border border-emerald-500/30 rounded-xl">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300 font-semibold">Connection successful! Server is reachable.</span>
            </div>
          )}
          {testResult === 'fail' && (
            <div className="mt-4 flex items-start gap-2.5 p-3 bg-rose-950/50 border border-rose-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-rose-300 font-semibold">Connection failed</p>
                <p className="text-[11px] text-rose-400 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={testConnection}
              disabled={testing || !serverUrl.trim()}
              className="flex-1 py-2.5 rounded-xl border border-indigo-500/40 text-indigo-400 hover:bg-indigo-600/10 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {testing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>Testing...</span></>
              ) : (
                <><Globe className="w-4 h-4" /><span>Test Connection</span></>
              )}
            </button>

            <button
              onClick={handleSave}
              disabled={!serverUrl.trim()}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-4">
          You can change this later in Settings → Desktop Configuration
        </p>
      </div>
    </div>
  );
};
