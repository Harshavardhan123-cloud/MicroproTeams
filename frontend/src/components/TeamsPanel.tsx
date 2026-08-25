"use client";

import { useState } from "react";
import { Users, ChevronRight, ChevronDown, Hash } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

export default function TeamsPanel() {
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const selectChannel = useAppStore((s) => s.selectChannel);

  // Filter out DM channels, only keep regular channels
  const teamChannels = channels.filter(c => c.type !== "dm");

  // Mock organizational structure
  const orgTree = [
    {
      id: "org-eng",
      name: "Engineering",
      channels: teamChannels.filter(c => ["General", "Development", "DevOps"].includes(c.name) || true).slice(0, 3)
    },
    {
      id: "org-product",
      name: "Product & Design",
      channels: teamChannels.slice(3, 5)
    }
  ];

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "org-eng": true,
    "org-product": true,
  });

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="teams-sidebar" style={{ width: 350 }}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">Teams</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <Users size={18} />
        </div>
      </div>
      <div className="sidebar-content" style={{ padding: "10px 0" }}>
        {orgTree.map(node => (
          <div key={node.id} style={{ marginBottom: 8 }}>
            <div 
              onClick={() => toggleNode(node.id)}
              style={{ display: "flex", alignItems: "center", padding: "8px 16px", cursor: "pointer", color: "hsl(var(--text-primary))", fontWeight: 600, fontSize: 13 }}
            >
              {expandedNodes[node.id] ? <ChevronDown size={16} style={{ marginRight: 6 }} /> : <ChevronRight size={16} style={{ marginRight: 6 }} />}
              {node.name}
            </div>
            
            {expandedNodes[node.id] && (
              <div style={{ paddingLeft: 16 }}>
                {node.channels.map(channel => {
                  const isActive = activeChannelId === channel.id;
                  return (
                    <div 
                      key={channel.id}
                      onClick={() => selectChannel(channel.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 16px 8px 32px",
                        cursor: "pointer",
                        background: isActive ? "hsl(var(--surface-2))" : "transparent",
                        borderLeft: isActive ? "3px solid hsl(var(--color-primary))" : "3px solid transparent",
                        color: isActive ? "hsl(var(--text-primary))" : "hsl(var(--text-secondary))",
                        fontSize: 13,
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      <Hash size={14} style={{ marginRight: 8 }} />
                      {channel.name}
                    </div>
                  );
                })}
                {node.channels.length === 0 && (
                  <div style={{ padding: "8px 16px 8px 32px", color: "hsl(var(--text-muted))", fontSize: 12 }}>
                    No channels available
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
