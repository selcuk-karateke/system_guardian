import { Orbitron } from "next/font/google";
import "./monitor.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-orbitron",
});

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
