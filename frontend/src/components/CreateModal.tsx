"use client";

import { useEffect, useState } from "react";

interface CreateModalProps {
  title: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  description?: string;
  onSubmit: (value: string) => Promise<unknown>;
  onClose: () => void;
}

export default function CreateModal({
  title,
  label,
  placeholder,
  submitLabel,
  description,
  onSubmit,
  onClose,
}: CreateModalProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    await onSubmit(value.trim());
    setBusy(false);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: description ? 6 : 20 }}>
          {title}
        </h2>
        {description && (
          <p
            style={{
              fontSize: 13,
              color: "hsl(var(--text-muted))",
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="create-modal-input">
              {label}
            </label>
            <input
              id="create-modal-input"
              className="input"
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!value.trim() || busy}>
              {busy ? "Working…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
