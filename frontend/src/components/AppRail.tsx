"use client";

import { MessageSquare, Video, Users, FolderOpen, Bell, Settings } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

const navItems = [
  { id: "chat",     label: "Chat",     icon: MessageSquare, path: "/workspace" },
  { id: "meetings", label: "Calls",    icon: Video,         path: "/meeting/lobby" },
  { id: "teams",    label: "Teams",    icon: Users,         path: "/workspace" },
  { id: "files",    label: "Files",    icon: FolderOpen,    path: "/files" },
  { id: "activity", label: "Activity", icon: Bell,          badge: "3", path: "/workspace" },
  { id: "settings", label: "Settings", icon: Settings,      path: "/settings" },
];

export default function AppRail({ activeTab }: { activeTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const resolveActive = (item: typeof navItems[0]) => {
    if (activeTab) return activeTab === item.id;
    if (item.path === "/workspace") return pathname === "/workspace";
    if (item.path === "/files") return pathname.startsWith("/files");
    if (item.path === "/settings") return pathname.startsWith("/settings");
    return false;
  };

  return (
    <nav className="app-rail" aria-label="App navigation">
      {/* Logo */}
      <div className="app-rail-logo" title="MicroproTeams">
        <img
          src="/Logo.png"
          alt="MicroproTeams"
          style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 8 }}
        />
      </div>

      {/* Nav buttons */}
      <div className="app-rail-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = resolveActive(item);
          return (
            <button
              key={item.id}
              id={`rail-${item.id}`}
              className={`app-rail-btn ${isActive ? "active" : ""}`}
              onClick={() => router.push(item.path)}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="app-rail-icon-wrapper">
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                {item.badge && <span className="rail-badge">{item.badge}</span>}
              </div>
              <span className="app-rail-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
