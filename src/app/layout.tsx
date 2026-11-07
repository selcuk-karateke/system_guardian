import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/dashboard/app-shell";
import { BackgroundJobsOverlay } from "@/components/jobs/background-jobs-overlay";
import { ActionToastHost } from "@/components/ui/action-toast";
import "./globals.css";
import "./dashboard.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "System Guardian",
    template: "%s · System Guardian",
  },
  description: "Monitoring, security, and infrastructure for Coolify",
  applicationName: "System Guardian",
  openGraph: {
    title: "System Guardian",
    description: "Monitoring, security, and infrastructure for Coolify",
    type: "website",
    locale: "de_DE",
    siteName: "System Guardian",
  },
  twitter: {
    card: "summary_large_image",
    title: "System Guardian",
    description: "Monitoring, security, and infrastructure for Coolify",
  },
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
      <body className="h-full overflow-hidden bg-zinc-950 text-zinc-100">
        <AppShell>{children}</AppShell>
        <BackgroundJobsOverlay />
        <ActionToastHost />
      </body>
    </html>
  );
}
