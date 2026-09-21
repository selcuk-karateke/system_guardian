import type { WallboardData } from "@/lib/monitor-wallboard";

const THREAT_CLASS = {
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "crit",
} as const;

export function McSecurityFrame({
  security,
  globalTone,
}: {
  security: WallboardData["security"];
  globalTone: "ok" | "warn" | "crit";
}) {
  const tone = THREAT_CLASS[security.threatLevel] ?? globalTone;

  return (
    <div
      className={`mc-secframe mc-secframe--${tone}`}
      aria-label={`Security ${security.threatLevel}`}
      data-threat={security.threatLevel}
    >
      <div className="mc-secframe-edge mc-secframe-edge--top" />
      <div className="mc-secframe-edge mc-secframe-edge--right" />
      <div className="mc-secframe-edge mc-secframe-edge--bottom" />
      <div className="mc-secframe-edge mc-secframe-edge--left" />
      <ul className="mc-secframe-leds">
        {security.blocks.map((b) => (
          <li
            key={b.label}
            className={`mc-secframe-led mc-secframe-led--${b.status}`}
            title={`${b.label}: ${b.value}`}
          >
            <span className="mc-secframe-led-dot" />
          </li>
        ))}
      </ul>
      <div
        className={`mc-secframe-threat mc-secframe-threat--${tone}`}
        title={`Threat ${security.threatLevel}`}
        aria-hidden
      />
    </div>
  );
}
