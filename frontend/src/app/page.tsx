"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      router.push("/workspace");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", background: "hsl(220 15% 7%)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <img src="/Logo.png" alt="Micropro Teams" style={{ width: 56, height: 56, objectFit: "contain" }} />
        <p style={{ color: "hsl(220 5% 65%)", fontSize: 14 }}>Loading MicroproTeams…</p>
      </div>
    </div>
  );
}
