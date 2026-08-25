"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // api.auth.login persists the token pair and cached user
      await api.auth.login(email, password);
      router.push("/workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
          <img src="/Logo.png" alt="Micropro Teams" style={{ height: 42, width: "auto", objectFit: "contain" }} />
          <span className="auth-logo-text" style={{ fontSize: 22, fontWeight: 700 }}>Micropro<span style={{ color: "#e03e2d" }}>Teams</span></span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: "center" }}>Welcome back</h1>
        <p style={{ color: "hsl(var(--text-muted))", fontSize: 14, textAlign: "center", marginBottom: 28 }}>
          Sign in to your workspace
        </p>

        <form className="auth-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email address</label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="form-error" role="alert">⚠ {error}</p>}

          <button id="login-submit" type="submit" className="btn btn-primary" disabled={loading}
            style={{ justifyContent: "center", padding: "11px 14px", fontSize: 15, marginTop: 4 }}>
            {loading ? "Signing in…" : "Sign in →"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", color: "hsl(var(--text-muted))", fontSize: 13 }}>
          Don't have an account?{" "}
          <Link href="/register" style={{ color: "hsl(var(--color-primary))", textDecoration: "none", fontWeight: 500 }}>
            Create account
          </Link>
        </div>

        {/* SSO Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 0" }}>
          <div style={{ flex: 1, height: 1, background: "hsl(var(--border-subtle))" }} />
          <span style={{ color: "hsl(var(--text-muted))", fontSize: 12 }}>or continue with</span>
          <div style={{ flex: 1, height: 1, background: "hsl(var(--border-subtle))" }} />
        </div>

        {/* Keycloak SSO is provisioned in the stack but /auth/sso is not
            implemented yet — disabled rather than linking to a 404. */}
        <button id="sso-btn" className="btn btn-ghost" disabled title="SSO is not configured yet"
          style={{ width: "100%", justifyContent: "center", marginTop: 12, opacity: 0.55, cursor: "not-allowed" }}>
          🔐 Single Sign-On (SSO) — coming soon
        </button>
      </div>
    </div>
  );
}
