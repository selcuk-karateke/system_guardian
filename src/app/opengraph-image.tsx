import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "System Guardian";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #050508 0%, #0a1620 48%, #061018 100%)",
          color: "#fafafa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              border: "2px solid #22d3ee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "#22d3ee",
              }}
            />
          </div>
          <div style={{ fontSize: 28, color: "#94a3b8", letterSpacing: 4 }}>
            SYSTEM GUARDIAN
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>
            Monitoring &amp; Security
          </div>
          <div style={{ fontSize: 28, color: "#94a3b8", maxWidth: 780 }}>
            Coolify · RAID · Docker · Alerts — S1–S4 Crisis Stages
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, color: "#22d3ee", fontSize: 22 }}>
          <span>#22d3ee</span>
          <span style={{ color: "#64748b" }}>·</span>
          <span style={{ color: "#fbbf24" }}>#fbbf24</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
