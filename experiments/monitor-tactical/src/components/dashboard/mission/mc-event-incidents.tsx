import type { WallboardEvent } from "@/lib/monitor-wallboard";

export function McEventIncidents({ events }: { events: WallboardEvent[] }) {
  if (events.length === 0) {
    return <div className="mc-incident-empty" aria-hidden />;
  }

  return (
    <ul className="mc-incidents">
      {events.map((e, i) => (
        <li
          key={e.id}
          className={`mc-incident mc-incident--${e.level}`}
          style={{ animationDelay: `${i * 0.1}s` }}
          title={e.text}
        >
          <span className="mc-incident-bar" aria-hidden />
          <span className="mc-incident-glyph" aria-hidden />
          <span className="mc-incident-title">{e.title}</span>
        </li>
      ))}
    </ul>
  );
}
