"use client";

import { Bell, MessageSquare, Phone, UserPlus } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export default function ActivityPanel() {
  const user = useAppStore((s) => s.user);

  // Mock activity feed for now
  const activities = [
    { id: 1, type: "mention", title: "Shreyas Bhatt mentioned you", desc: "In 'Engineering Sync'", time: "10m ago", read: false, icon: MessageSquare, color: "var(--color-primary)" },
    { id: 2, type: "call", title: "Missed call from Admin User", desc: "Direct Message", time: "1h ago", read: false, icon: Phone, color: "var(--color-danger)" },
    { id: 3, type: "system", title: "Welcome to MicroproTeams!", desc: "You've been added to the workspace.", time: "2h ago", read: true, icon: UserPlus, color: "var(--color-success)" }
  ];

  return (
    <div className="teams-sidebar" style={{ width: 350 }}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">Activity</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <Bell size={18} />
        </div>
      </div>
      <div className="sidebar-content" style={{ padding: "0 10px", marginTop: 10 }}>
        {activities.map((a) => {
          const Icon = a.icon;
          return (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 10px", borderRadius: 8, cursor: "pointer", background: a.read ? "transparent" : "hsl(var(--surface-2))", marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `hsl(${a.color})`, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                <Icon size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: a.read ? 500 : 600, color: "hsl(var(--text-primary))" }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: "hsl(var(--text-muted))" }}>{a.time}</div>
                </div>
                <div style={{ fontSize: 12, color: "hsl(var(--text-secondary))" }}>{a.desc}</div>
              </div>
              {!a.read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--color-primary))", alignSelf: "center" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
