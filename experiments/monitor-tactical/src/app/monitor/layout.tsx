import type { Viewport } from "next";
import { Orbitron } from "next/font/google";
import "./monitor-mission.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-orbitron",
});

/** Full viewport on TV browsers; scaling handled in monitor-mission.css */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${orbitron.variable} fixed inset-0 overflow-hidden`}>
      {children}
    </div>
  );
}
