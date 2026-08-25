"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", display_name: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
    setLoading(true); setError("");
    try {
      await api.auth.register({
        email: form.email,
        display_name: form.display_name,
        password: form.password,
      });
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
          <img src="/Logo.png" alt="Micropro Teams" style={{ height: 42, width: "auto", objectFit: "contain" }} />
          <span className="auth-logo-text" style={{ fontSize: 22, fontWeight: 700 }}>Micropro<span style={{ color: "#e03e2d" }}>Teams</span></span>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: "center" }}>Create your account</h1>
        <p style={{ color: "hsl(var(--text-muted))", fontSize: 14, textAlign: "center", marginBottom: 28 }}>
          Join your team on MicroproTeams
        </p>

        <form className="auth-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input className="input" type="text" placeholder="Jane Doe" value={form.display_name} onChange={update("display_name")} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="input" type="email" placeholder="you@company.com" value={form.email} onChange={update("email")} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="input" type="password" placeholder="Minimum 8 characters" value={form.password} onChange={update("password")} required minLength={8} />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <input className="input" type="password" placeholder="••••••••" value={form.confirm} onChange={update("confirm")} required />
          </div>

          {error && <p className="form-error" role="alert">⚠ {error}</p>}

          <button id="register-submit" type="submit" className="btn btn-primary" disabled={loading}
            style={{ justifyContent: "center", padding: "11px 14px", fontSize: 15, marginTop: 4 }}>
            {loading ? "Creating account…" : "Create account →"}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: "center", color: "hsl(var(--text-muted))", fontSize: 13 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "hsl(var(--color-primary))", textDecoration: "none", fontWeight: 500 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
