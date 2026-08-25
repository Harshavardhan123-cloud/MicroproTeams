import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MicroproTeams — Enterprise Communication Platform",
  description: "AI-powered team collaboration with real-time chat, HD video conferencing, automatic meeting notes, and semantic search.",
  keywords: "team collaboration, video conferencing, AI meeting notes, chat, enterprise",
  openGraph: {
    title: "MicroproTeams",
    description: "Your AI-powered enterprise communication platform",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/Logo.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
