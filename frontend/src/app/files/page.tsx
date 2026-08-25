"use client";

/**
 * MicroproTeams — File Browser Page
 * Shared file storage per workspace: upload, preview, download, manage.
 */

import { useCallback, useRef, useState } from "react";
import {
  Upload, Search, Grid, List, Download, Trash2,
  FileText, Image, Film, FileArchive, File,
  FolderOpen, ChevronRight, SortAsc, Filter, MoreHorizontal,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

// ── Types ──────────────────────────────────────────────────────────────────

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  url?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getFileIcon(mime: string, size = 18) {
  if (mime.startsWith("image/")) return <Image size={size} color="hsl(270 85% 65%)" />;
  if (mime.startsWith("video/")) return <Film size={size} color="hsl(38 92% 50%)" />;
  if (mime.includes("pdf") || mime.includes("text")) return <FileText size={size} color="hsl(220 90% 60%)" />;
  if (mime.includes("zip") || mime.includes("tar") || mime.includes("gzip")) return <FileArchive size={size} color="hsl(142 71% 45%)" />;
  return <File size={size} color="hsl(var(--text-muted))" />;
}

// ── Demo data ──────────────────────────────────────────────────────────────

const DEMO_FILES: FileItem[] = [
  { id: "f1", name: "Q3 Product Roadmap.pdf", size: 2_450_000, type: "pdf", mimeType: "application/pdf", uploadedBy: "Sarah Chen", uploadedAt: "2026-08-20T10:30:00Z" },
  { id: "f2", name: "Architecture Diagram v3.png", size: 1_200_000, type: "image", mimeType: "image/png", uploadedBy: "You", uploadedAt: "2026-08-22T14:15:00Z" },
  { id: "f3", name: "Meeting Recording — Sprint 41.mp4", size: 145_000_000, type: "video", mimeType: "video/mp4", uploadedBy: "System", uploadedAt: "2026-08-23T09:00:00Z" },
  { id: "f4", name: "design-tokens.zip", size: 340_000, type: "archive", mimeType: "application/zip", uploadedBy: "Alex Rivera", uploadedAt: "2026-08-19T16:45:00Z" },
  { id: "f5", name: "API_Specification.md", size: 52_000, type: "text", mimeType: "text/markdown", uploadedBy: "You", uploadedAt: "2026-08-24T08:00:00Z" },
  { id: "f6", name: "Brand Guidelines 2026.pdf", size: 8_700_000, type: "pdf", mimeType: "application/pdf", uploadedBy: "Sarah Chen", uploadedAt: "2026-08-15T11:00:00Z" },
];

// ── Main Page ────────────────────────────────────────────────────────────────

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>(DEMO_FILES);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    const newItems: FileItem[] = dropped.map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      type: f.type.split("/")[0] || "file",
      mimeType: f.type,
      uploadedBy: "You",
      uploadedAt: new Date().toISOString(),
    }));
    setFiles((prev) => [...newItems, ...prev]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const added = Array.from(e.target.files || []).map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      type: f.type.split("/")[0] || "file",
      mimeType: f.type,
      uploadedBy: "You",
      uploadedAt: new Date().toISOString(),
    }));
    setFiles((prev) => [...added, ...prev]);
  };

  const deleteSelected = () => {
    setFiles((prev) => prev.filter((f) => !selected.has(f.id)));
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const breadcrumbs = ["Files"];

  return (
    <div className="app-shell">
      <Sidebar />

      <main
        className="main-content"
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* ── Header ── */}
        <header
          className="channel-header"
          style={{ justifyContent: "space-between", gap: 12, paddingRight: 16 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpen size={18} color="hsl(var(--text-muted))" />
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
              {breadcrumbs.map((b, i) => (
                <span key={b} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <ChevronRight size={12} color="hsl(var(--text-muted))" />}
                  <span style={{ fontWeight: i === breadcrumbs.length - 1 ? 600 : 400 }}>{b}</span>
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {selected.size > 0 && (
              <>
                <span style={{ fontSize: 12, color: "hsl(var(--text-muted))" }}>
                  {selected.size} selected
                </span>
                <button className="btn btn-ghost btn-sm" onClick={deleteSelected} style={{ color: "hsl(var(--color-danger))" }}>
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setViewMode((v) => v === "grid" ? "list" : "grid")}
              aria-label="Toggle view"
            >
              {viewMode === "grid" ? <List size={14} /> : <Grid size={14} />}
            </button>
            <button className="btn btn-ghost btn-sm" aria-label="Filter">
              <Filter size={14} /> Filter
            </button>
            <button className="btn btn-ghost btn-sm" aria-label="Sort">
              <SortAsc size={14} /> Sort
            </button>
            <button
              id="upload-files-btn"
              className="btn btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Upload
            </button>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileInput} />
          </div>
        </header>

        {/* ── Search bar ── */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid hsl(var(--border-subtle))", flexShrink: 0 }}>
          <div style={{ position: "relative", maxWidth: 480 }}>
            <Search size={14} color="hsl(var(--text-muted))" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              id="file-search"
              className="input"
              placeholder="Search files…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 32, height: 36, fontSize: 13 }}
            />
          </div>
        </div>

        {/* ── Drop zone overlay ── */}
        {isDragOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "hsl(var(--color-primary) / 0.08)",
              border: "2px dashed hsl(var(--color-primary))",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
              margin: 16,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <Upload size={40} color="hsl(var(--color-primary))" />
              <div style={{ marginTop: 12, fontWeight: 600, color: "hsl(var(--color-primary))" }}>Drop files to upload</div>
            </div>
          </div>
        )}

        {/* ── File list ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "hsl(var(--text-muted))" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--text-primary))", marginBottom: 8 }}>No files yet</div>
              <p style={{ fontSize: 13, marginBottom: 20 }}>Drop files here or click Upload to add files to this workspace.</p>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} /> Upload your first file
              </button>
            </div>
          ) : viewMode === "list" ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }}>
                  {["", "Name", "Uploaded by", "Size", "Date", ""].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: "1px solid hsl(var(--border-subtle) / 0.5)",
                      background: selected.has(f.id) ? "hsl(var(--color-primary) / 0.06)" : "transparent",
                      cursor: "pointer",
                      transition: "background 0.1s ease",
                    }}
                    onMouseEnter={(e) => { if (!selected.has(f.id)) (e.currentTarget as HTMLElement).style.background = "hsl(var(--surface-2))"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = selected.has(f.id) ? "hsl(var(--color-primary) / 0.06)" : "transparent"; }}
                  >
                    <td style={{ padding: "10px 10px", width: 32 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggleSelect(f.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {getFileIcon(f.mimeType)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--text-primary))" }}>{f.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 12, color: "hsl(var(--text-secondary))" }}>{f.uploadedBy}</td>
                    <td style={{ padding: "10px 10px", fontSize: 12, color: "hsl(var(--text-muted))" }}>{formatBytes(f.size)}</td>
                    <td style={{ padding: "10px 10px", fontSize: 12, color: "hsl(var(--text-muted))" }}>{formatDate(f.uploadedAt)}</td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button className="action-btn" aria-label="Download" title="Download">
                          <Download size={14} />
                        </button>
                        <button className="action-btn" aria-label="More options" title="More options">
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              {filtered.map((f) => (
                <div
                  key={f.id}
                  className="card"
                  onClick={() => toggleSelect(f.id)}
                  style={{
                    cursor: "pointer",
                    border: selected.has(f.id) ? "1px solid hsl(var(--color-primary))" : "1px solid hsl(var(--border-subtle))",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 14,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: 32 }}>{getFileIcon(f.mimeType, 32)}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--text-primary))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: "hsl(var(--text-muted))" }}>{formatBytes(f.size)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Storage bar ── */}
        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid hsl(var(--border-subtle))",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, height: 4, background: "hsl(var(--surface-3))", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: "34%", height: "100%", background: "linear-gradient(90deg, hsl(var(--color-primary)), hsl(var(--color-accent)))", borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, color: "hsl(var(--text-muted))", whiteSpace: "nowrap" }}>
            {formatBytes(files.reduce((a, f) => a + f.size, 0))} of 50 GB used
          </span>
        </div>
      </main>
    </div>
  );
}
