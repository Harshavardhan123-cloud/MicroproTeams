"use client";

/**
 * MicroproTeams — Settings Page
 * User profile, notifications, appearance, security, and workspace admin settings.
 */

import { useState } from "react";
import {
  User, Bell, Palette, Shield, Globe, Database,
  LogOut, Moon, Volume2, VolumeX, Check, ChevronRight, Key, Trash2, Download, ArrowLeft
} from "lucide-react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";

// ── Types & Constants ──────────────────────────────────────────────────────

type SettingsSection =
  | "profile"
  | "notifications"
  | "appearance"
  | "audio-video"
  | "security"
  | "privacy"
  | "workspace"
  | "data";

interface NavItem {
  id: SettingsSection;
  icon: React.ReactNode;
  label: string;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", icon: <User size={16} />, label: "Profile", group: "Account" },
  { id: "notifications", icon: <Bell size={16} />, label: "Notifications", group: "Account" },
  { id: "security", icon: <Shield size={16} />, label: "Security & Privacy", group: "Account" },
  { id: "appearance", icon: <Palette size={16} />, label: "Appearance", group: "Preferences" },
  { id: "audio-video", icon: <Volume2 size={16} />, label: "Audio & Video", group: "Preferences" },
  { id: "workspace", icon: <Globe size={16} />, label: "Workspace Settings", group: "Admin" },
  { id: "data", icon: <Database size={16} />, label: "Data & Storage", group: "Admin" },
];

// ── Section components ─────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "hsl(var(--text-primary))", marginBottom: 4 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: "hsl(var(--text-muted))", lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 0",
        borderBottom: "1px solid hsl(var(--border-subtle))",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--text-primary))" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: "hsl(var(--text-muted))", marginTop: 2, lineHeight: 1.5 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: checked ? "hsl(var(--color-primary))" : "hsl(var(--surface-4))",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

// ── Content panels ─────────────────────────────────────────────────────────

function ProfileSection() {
  const [displayName, setDisplayName] = useState("Alex Johnson");
  const [username, setUsername] = useState("alex.johnson");
  const [status, setStatus] = useState("🏗️ Building MicroproTeams");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <SectionHeader title="Profile" subtitle="Manage how others see you in the workspace." />

      {/* Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent)))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 700,
            color: "white",
            flexShrink: 0,
          }}
        >
          AJ
        </div>
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginRight: 8 }}>Change photo</button>
          <button className="btn btn-ghost btn-sm" style={{ color: "hsl(var(--color-danger))" }}>Remove</button>
          <p style={{ fontSize: 11, color: "hsl(var(--text-muted))", marginTop: 6 }}>
            JPG, PNG or GIF. Max 5MB.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
        <div className="form-group">
          <label className="form-label">Display name</label>
          <input id="settings-display-name" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Username</label>
          <input id="settings-username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          <span style={{ fontSize: 11, color: "hsl(var(--text-muted))", marginTop: 4 }}>
            Your handle: @{username}
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <input id="settings-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="What are you up to?" />
        </div>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="input" defaultValue="alex.johnson@company.com" type="email" disabled style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 11, color: "hsl(var(--text-muted))", marginTop: 4 }}>
            Email is managed by your SSO provider.
          </span>
        </div>
        <button
          id="save-profile-btn"
          className="btn btn-primary"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
          onClick={save}
        >
          {saved ? <><Check size={14} /> Saved!</> : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [settings, setSettings] = useState({
    mentions: true,
    dms: true,
    allMessages: false,
    reactions: true,
    meetingReminders: true,
    emailDigest: true,
    mobilePush: true,
    soundEnabled: true,
    dndEnabled: false,
    dndFrom: "22:00",
    dndTo: "08:00",
    aiAlerts: true,
  });

  const toggle = (key: keyof typeof settings) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }));

  return (
    <div>
      <SectionHeader title="Notifications" subtitle="Control when and how you get notified." />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Notify me about</div>
        <SettingRow label="@mentions and keywords" description="Get notified when someone mentions you" control={<Toggle checked={settings.mentions} onChange={() => toggle("mentions")} />} />
        <SettingRow label="Direct messages" description="New DMs and group messages" control={<Toggle checked={settings.dms} onChange={() => toggle("dms")} />} />
        <SettingRow label="All messages" description="Every new message in active channels" control={<Toggle checked={settings.allMessages} onChange={() => toggle("allMessages")} />} />
        <SettingRow label="Emoji reactions" description="When someone reacts to your messages" control={<Toggle checked={settings.reactions} onChange={() => toggle("reactions")} />} />
        <SettingRow label="Meeting reminders" description="15 minutes before a meeting starts" control={<Toggle checked={settings.meetingReminders} onChange={() => toggle("meetingReminders")} />} />
        <SettingRow label="AI alerts" description="Action items and summaries from meetings" control={<Toggle checked={settings.aiAlerts} onChange={() => toggle("aiAlerts")} />} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Delivery</div>
        <SettingRow label="Email digest" description="Daily summary of missed notifications" control={<Toggle checked={settings.emailDigest} onChange={() => toggle("emailDigest")} />} />
        <SettingRow label="Mobile push" description="Notifications on your mobile device" control={<Toggle checked={settings.mobilePush} onChange={() => toggle("mobilePush")} />} />
        <SettingRow label="Notification sounds" control={<Toggle checked={settings.soundEnabled} onChange={() => toggle("soundEnabled")} />} />
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Do Not Disturb</div>
        <SettingRow
          label="Enable Do Not Disturb"
          description="Silence all notifications during set hours"
          control={<Toggle checked={settings.dndEnabled} onChange={() => toggle("dndEnabled")} />}
        />
        {settings.dndEnabled && (
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">From</label>
              <input className="input" type="time" value={settings.dndFrom} onChange={(e) => setSettings((s) => ({ ...s, dndFrom: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Until</label>
              <input className="input" type="time" value={settings.dndTo} onChange={(e) => setSettings((s) => ({ ...s, dndTo: e.target.value }))} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [theme] = useState("dark");
  const [fontSize, setFontSize] = useState("medium");
  const [compactMode, setCompactMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  const themes = [
    { id: "dark", label: "Dark", emoji: "🌙" },
    { id: "light", label: "Light", emoji: "☀️" },
    { id: "system", label: "System", emoji: "💻" },
  ];

  const fontSizes = ["small", "medium", "large"];

  return (
    <div>
      <SectionHeader title="Appearance" subtitle="Customize how MicroproTeams looks for you." />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 12 }}>Theme</div>
        <div style={{ display: "flex", gap: 10 }}>
          {themes.map((t) => (
            <button
              key={t.id}
              className="card"
              style={{
                width: 100,
                padding: "16px 12px",
                textAlign: "center",
                cursor: "pointer",
                border: theme === t.id ? "2px solid hsl(var(--color-primary))" : "1px solid hsl(var(--border-subtle))",
                background: theme === t.id ? "hsl(var(--color-primary) / 0.08)" : "hsl(var(--surface-2))",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{t.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 12 }}>Message Font Size</div>
        <div style={{ display: "flex", gap: 8 }}>
          {fontSizes.map((s) => (
            <button
              key={s}
              onClick={() => setFontSize(s)}
              className="btn btn-ghost btn-sm"
              style={{
                background: fontSize === s ? "hsl(var(--color-primary) / 0.15)" : undefined,
                borderColor: fontSize === s ? "hsl(var(--color-primary))" : undefined,
                color: fontSize === s ? "hsl(var(--color-primary))" : undefined,
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <SettingRow label="Compact mode" description="Show more messages with reduced spacing" control={<Toggle checked={compactMode} onChange={() => setCompactMode((v) => !v)} />} />
      <SettingRow label="Animations" description="Enable micro-animations and transitions" control={<Toggle checked={animationsEnabled} onChange={() => setAnimationsEnabled((v) => !v)} />} />
    </div>
  );
}

function SecuritySection() {
  return (
    <div>
      <SectionHeader title="Security & Privacy" subtitle="Manage your account security and data privacy settings." />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Authentication</div>
        <SettingRow
          label="Change password"
          description="Update your account password"
          control={<button className="btn btn-ghost btn-sm"><Key size={13} /> Change</button>}
        />
        <SettingRow
          label="Two-factor authentication"
          description="Add an extra layer of security with TOTP or passkey"
          control={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "hsl(var(--color-success))", fontWeight: 600 }}>✓ Enabled</span>
              <button className="btn btn-ghost btn-sm">Manage</button>
            </div>
          }
        />
        <SettingRow
          label="Active sessions"
          description="View and revoke all active login sessions"
          control={<button className="btn btn-ghost btn-sm"><ChevronRight size={13} /></button>}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Encryption Keys</div>
        <div className="card" style={{ background: "hsl(var(--color-primary) / 0.05)", borderColor: "hsl(var(--color-primary) / 0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Key size={16} color="hsl(var(--color-primary))" />
            <span style={{ fontWeight: 600, fontSize: 13 }}>E2E Encryption</span>
            <span className="ai-badge" style={{ background: "hsl(var(--color-success))" }}>ACTIVE</span>
          </div>
          <p style={{ fontSize: 12, color: "hsl(var(--text-muted))", lineHeight: 1.6, marginBottom: 12 }}>
            Your direct messages are end-to-end encrypted. Your private key never leaves your device.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm">Export key backup</button>
            <button className="btn btn-ghost btn-sm">Rotate keys</button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, padding: 16, borderRadius: 10, background: "hsl(var(--color-danger) / 0.05)", border: "1px solid hsl(var(--color-danger) / 0.2)" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "hsl(var(--color-danger))", marginBottom: 8 }}>⚠ Danger Zone</div>
        <p style={{ fontSize: 12, color: "hsl(var(--text-muted))", marginBottom: 12 }}>
          Deleting your account is permanent and cannot be undone. All your messages and data will be removed.
        </p>
        <button className="btn btn-danger btn-sm">
          <Trash2 size={13} /> Delete my account
        </button>
      </div>
    </div>
  );
}

function DataSection() {
  return (
    <div>
      <SectionHeader title="Data & Storage" subtitle="Export your data or manage storage settings." />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { emoji: "📦", label: "Export all data", desc: "Download all your messages, files, and account data (GDPR export)", action: "Export" },
          { emoji: "📝", label: "Export messages", desc: "Download a JSON export of your direct messages and channel history", action: "Export" },
          { emoji: "📁", label: "Export files", desc: "Download all files you've uploaded to the workspace", action: "Export" },
          { emoji: "📊", label: "Activity log", desc: "View your full login and activity history", action: "View" },
        ].map((item) => (
          <div key={item.label} className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{item.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--text-primary))" }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "hsl(var(--text-muted))", marginTop: 2 }}>{item.desc}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
              <Download size={13} /> {item.action}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 12 }}>Cache</div>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Local cache</div>
            <div style={{ fontSize: 12, color: "hsl(var(--text-muted))", marginTop: 2 }}>Cached messages and images: 124 MB</div>
          </div>
          <button className="btn btn-ghost btn-sm">Clear cache</button>
        </div>
      </div>
    </div>
  );
}

function AudioVideoSection() {
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [noiseCancellation, setNoiseCancellation] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [hd, setHd] = useState(false);
  const [vb, setVb] = useState(false);

  return (
    <div>
      <SectionHeader title="Audio & Video" subtitle="Configure your microphone, camera, and call settings." />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Microphone</div>
        <SettingRow label="Enable microphone" control={<Toggle checked={micEnabled} onChange={() => setMicEnabled((v) => !v)} />} />
        <SettingRow label="Noise cancellation" description="Powered by RNNoise — removes background noise" control={<Toggle checked={noiseCancellation} onChange={() => setNoiseCancellation((v) => !v)} />} />
        <SettingRow label="Echo cancellation" control={<Toggle checked={echoCancellation} onChange={() => setEchoCancellation((v) => !v)} />} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 8 }}>Camera</div>
        <SettingRow label="Enable camera" control={<Toggle checked={camEnabled} onChange={() => setCamEnabled((v) => !v)} />} />
        <SettingRow label="HD video (1080p)" description="Uses more bandwidth — recommended on fast connections" control={<Toggle checked={hd} onChange={() => setHd((v) => !v)} />} />
        <SettingRow label="Virtual background" description="Blur or replace your background during calls" control={<Toggle checked={vb} onChange={() => setVb((v) => !v)} />} />
      </div>
    </div>
  );
}

function WorkspaceSection() {
  const [wsName, setWsName] = useState("Micropro Engineering");
  const [retentionDays, setRetentionDays] = useState("365");

  return (
    <div>
      <SectionHeader title="Workspace Settings" subtitle="Configure your workspace for all members. Admin access required." />

      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
        <div className="form-group">
          <label className="form-label">Workspace name</label>
          <input id="settings-workspace-name" className="input" value={wsName} onChange={(e) => setWsName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Message retention (days)</label>
          <select className="input" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} style={{ cursor: "pointer" }}>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
            <option value="0">Forever</option>
          </select>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Save workspace settings</button>
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--text-muted))", marginBottom: 12 }}>Integrations</div>
        {[
          { name: "GitHub", icon: "🐙", connected: true },
          { name: "Jira", icon: "🎯", connected: false },
          { name: "Google Drive", icon: "📁", connected: true },
          { name: "Slack (migration)", icon: "🔔", connected: false },
        ].map((intg) => (
          <div key={intg.name} className="card" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{intg.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{intg.name}</div>
              <div style={{ fontSize: 11, color: intg.connected ? "hsl(var(--color-success))" : "hsl(var(--text-muted))" }}>
                {intg.connected ? "✓ Connected" : "Not connected"}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm">{intg.connected ? "Disconnect" : "Connect"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SECTION_COMPONENTS: Record<SettingsSection, React.ReactNode> = {
  profile: <ProfileSection />,
  notifications: <NotificationsSection />,
  appearance: <AppearanceSection />,
  "audio-video": <AudioVideoSection />,
  security: <SecuritySection />,
  privacy: <SecuritySection />,
  workspace: <WorkspaceSection />,
  data: <DataSection />,
};

export default function SettingsPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content" style={{ flexDirection: "row" }}>
        {/* ── Settings nav ── */}
        <div
          style={{
            width: 220,
            borderRight: "1px solid hsl(var(--border-subtle))",
            flexShrink: 0,
            overflowY: "auto",
            padding: "16px 0",
            background: "hsl(var(--surface-1))",
          }}
        >
          <div style={{ padding: "4px 16px 12px", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            <button 
              className="action-btn" 
              onClick={() => router.push("/workspace")}
              title="Back to Workspace"
            >
              <ArrowLeft size={16} />
            </button>
            Settings
          </div>
          {groups.map((group) => (
            <div key={group} style={{ marginBottom: 16 }}>
              <div className="sidebar-label" style={{ justifyContent: "flex-start" }}>{group}</div>
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => (
                <button
                  key={item.id}
                  id={`settings-nav-${item.id}`}
                  className={`sidebar-item${activeSection === item.id ? " active" : ""}`}
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setActiveSection(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}

          <div style={{ margin: "8px 8px 0", borderTop: "1px solid hsl(var(--border-subtle))", paddingTop: 12 }}>
            <button className="sidebar-item" style={{ width: "100%", textAlign: "left", color: "hsl(var(--color-danger))" }}>
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* ── Settings content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 40px", maxWidth: 700 }}>
          {SECTION_COMPONENTS[activeSection]}
        </div>
      </main>
    </div>
  );
}
