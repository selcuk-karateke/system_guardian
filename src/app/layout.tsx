import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "System Guardian",
  description: "Monitoring, security, and infrastructure for Coolify",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-zinc-950 text-zinc-100">
        <aside className="w-56 shrink-0 border-r border-zinc-800">
          <SidebarNav />
        </aside>
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </body>
    </html>
  );
}
