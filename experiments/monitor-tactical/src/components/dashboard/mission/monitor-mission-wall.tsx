import Link from "next/link";
import { MonitorClock } from "../monitor-clock";
import { McCoreBeacon } from "./mc-core-beacon";
import { McDockerInfra } from "./mc-docker-infra";
import { McEventIncidents } from "./mc-event-incidents";
import { McNetworkTactical } from "./mc-network-tactical";
import { McSecurityFrame } from "./mc-security-frame";
import { McStageScaler } from "./mc-stage-scaler";
import { McZoneActions } from "./mc-zone-actions";
import type { WallboardData } from "@/lib/monitor-wallboard";

const DOMAIN_HREF: Record<string, string> = {
  network: "/history?module=network",
  docker: "/docker",
  security: "/security",
};

const TONE = {
  healthy: "ok",
  warning: "warn",
  critical: "crit",
} as const;

type Props = {
  data: WallboardData;
  hostLabel: string;
  hostIp: string;
  checkMode: string;
};

export function MonitorMissionWall({
  data,
  hostLabel,
  hostIp,
  checkMode,
}: Props) {
  const tone = TONE[data.globalStatus];
  const networkTone = TONE[data.network.domainStatus] ?? "ok";
  const dockerDomain = data.domains.find((d) => d.id === "docker");
  const dockerTone = dockerDomain ? TONE[dockerDomain.status] : "ok";

  return (
    <div className="mc-wall" data-status={data.globalStatus}>
      <header className="mc-header">
        <span className="mc-brand">System Guardian</span>
        {checkMode === "ssh" && <span className="mc-live"> LIVE</span>}
        <span className="mc-host">
          {hostLabel} · {hostIp}
        </span>
        <div className="mc-header-meta">
          <MonitorClock />
          <Link href="/" className="mc-link">
            Dashboard
          </Link>
        </div>
      </header>

      <McStageScaler>
        <div className="mc-deck">
          <McSecurityFrame security={data.security} globalTone={tone} />

          <section className={`mc-holocore mc-holocore--${networkTone}`}>
            <McNetworkTactical hostIp={hostIp} network={data.network} />
            <Link
              href={DOMAIN_HREF.network}
              className="mc-zone-hit"
              aria-label="Network"
            />
          </section>

          <section className={`mc-beacon-zone mc-beacon-zone--${tone}`}>
            <McCoreBeacon data={data} />
            <Link href="/" className="mc-zone-hit" aria-label="System Core" />
          </section>

          <section className={`mc-topo-zone mc-topo-zone--${dockerTone}`}>
            <McDockerInfra docker={data.docker} tone={dockerTone} />
            <Link href="/docker" className="mc-zone-hit" aria-label="Docker" />
          </section>

          <section className="mc-events-zone">
            <McEventIncidents events={data.events} />
            <Link
              href="/notifications"
              className="mc-zone-hit"
              aria-label="Events"
            />
          </section>

          <Link
            href={DOMAIN_HREF.security}
            className="mc-sec-hit"
            aria-label="Security"
          />

          <div className="mc-actions-bar">
            <McZoneActions zone="core" />
          </div>
        </div>
      </McStageScaler>
    </div>
  );
}
