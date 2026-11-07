"use client";

import Link from "next/link";
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  Globe2,
  GripVertical,
  History,
  LayoutGrid,
  LayoutTemplate,
  Monitor,
  Server,
  X,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { saveUiLayoutAction } from "@/app/actions/ui-layout";
import { AlertList } from "@/components/dashboard/alert-list";
import { CrisisStageBadge } from "@/components/dashboard/crisis-stage-badge";
import {
  ServerStatusList,
  type ServerStatusItem,
} from "@/components/dashboard/server-status-list";
import { TriggerChecks } from "@/components/dashboard/trigger-checks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { GlobalStatus } from "@/lib/dashboard-data";
import type { CrisisStage } from "@/lib/crisis/stages";
import {
  HOME_WIDGET_IDS,
  moveInOrder,
  type HomeLayout,
  type HomeWidgetId,
  type UiLayout,
} from "@/lib/ui-layout";
import {
  patchLocalHome,
  readLocalUiLayout,
} from "@/lib/ui-layout-local";
import { notify, notifyResult } from "@/lib/ui/notify";

/** JSON-safe server row (Date → ISO). */
export type HomeServerRow = Omit<ServerStatusItem, "lastCheckAt"> & {
  lastCheckAt: string | null;
};

type AlertRow = {
  id: string;
  level: string;
  module: string;
  message: string;
  recommendation: string | null;
  createdAt: string;
  crisisStage?: CrisisStage;
};

const LABELS: Record<HomeWidgetId, string> = {
  servers: "Server",
  alerts: "Warnungen",
};

const WIDGET_ICONS = {
  servers: Server,
  alerts: Bell,
} as const;

const iconBtnClass =
  "inline-flex size-9 items-center justify-center rounded-lg border border-zinc-700/80 bg-zinc-900/60 text-zinc-200 transition hover:border-cyan-500/40 hover:text-white";

const iconBtnQuietClass =
  "inline-flex size-9 items-center justify-center rounded-lg border border-zinc-800 bg-transparent text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200";

type Props = {
  initialLayout: UiLayout;
  canPersist: boolean;
  servers: HomeServerRow[];
  alerts: AlertRow[];
  crisisStage: CrisisStage | null;
};

function toServerItems(rows: HomeServerRow[]): ServerStatusItem[] {
  return rows.map((s) => ({
    ...s,
    status: s.status as GlobalStatus,
    lastCheckAt: s.lastCheckAt ? new Date(s.lastCheckAt) : null,
  }));
}

function isHomeWidgetId(id: string): id is HomeWidgetId {
  return (HOME_WIDGET_IDS as readonly string[]).includes(id);
}

export function HomeDashboardBuilder({
  initialLayout,
  canPersist,
  servers,
  alerts,
  crisisStage,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState<HomeLayout>(initialLayout.home);
  const [draft, setDraft] = useState<HomeLayout>(initialLayout.home);
  const [dragId, setDragId] = useState<HomeWidgetId | null>(null);
  const [overId, setOverId] = useState<HomeWidgetId | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (canPersist) {
      setHome(initialLayout.home);
      setDraft(initialLayout.home);
      return;
    }
    const local = readLocalUiLayout().home;
    setHome(local);
    setDraft(local);
  }, [canPersist, initialLayout.home]);

  function startEdit() {
    setDraft(home);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(home);
    setEditing(false);
    setDragId(null);
    setOverId(null);
  }

  function toggleHidden(id: HomeWidgetId) {
    setDraft((prev) => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter((h) => h !== id)
        : [...prev.hidden, id];
      return { ...prev, hidden };
    });
  }

  function save() {
    startTransition(async () => {
      if (canPersist) {
        const r = await saveUiLayoutAction({ home: draft });
        notifyResult(r);
        if (r.ok) {
          setHome(draft);
          setEditing(false);
        }
        return;
      }
      patchLocalHome(draft);
      setHome(draft);
      setEditing(false);
      notify({ message: "Layout gespeichert", tone: "ok" });
    });
  }

  const view = editing ? draft : home;
  const visible = view.order.filter(
    (id): id is HomeWidgetId =>
      isHomeWidgetId(id) && !view.hidden.includes(id),
  );

  function renderWidget(id: HomeWidgetId) {
    if (id === "servers") {
      return (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">Server</h2>
          <ServerStatusList servers={toServerItems(servers)} />
        </section>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-2">
            Aktuelle Warnungen
            <span className="text-xs font-normal text-zinc-500">
              nur S1–S4 ·{" "}
              <Link href="/docs" className="sg-link hover:underline">
                Matrix
              </Link>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AlertList compact items={alerts} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href="/monitor"
              className={iconBtnClass}
              title="Screensaver"
              aria-label="Screensaver"
            >
              <Monitor className="size-4 text-cyan-400" aria-hidden />
            </Link>
            <Link
              href="/monitor/globe"
              className={iconBtnClass}
              title="Globus"
              aria-label="Globus"
            >
              <Globe2 className="size-4 text-amber-300" aria-hidden />
            </Link>
            <Link
              href="/history"
              className={iconBtnQuietClass}
              title="Historie"
              aria-label="Historie"
            >
              <History className="size-4" aria-hidden />
            </Link>
            {!editing ? (
              <Button
                type="button"
                variant="outline"
                className="size-9 p-0"
                onClick={startEdit}
                title="Layout bearbeiten"
                aria-label="Layout bearbeiten"
              >
                <LayoutGrid className="size-4" aria-hidden />
              </Button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="size-9 p-0"
                  onClick={cancelEdit}
                  disabled={pending}
                  title="Abbrechen"
                  aria-label="Abbrechen"
                >
                  <X className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  className="size-9 p-0"
                  onClick={save}
                  disabled={pending}
                  title="Speichern"
                  aria-label="Speichern"
                >
                  <Check className="size-4" aria-hidden />
                </Button>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-4">
          <Link href="/docs" title="Krisenstufen S1–S4 — docs/CRISIS.md">
            {crisisStage != null ? (
              <CrisisStageBadge stage={crisisStage} showName />
            ) : (
              <Badge variant="healthy" className="text-sm px-3 py-1 font-medium">
                OK
              </Badge>
            )}
          </Link>
          <TriggerChecks variant="compact" />
        </div>
      </div>

      {editing ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
          <ul className="space-y-2">
            {draft.order.filter(isHomeWidgetId).map((id) => {
              const hidden = draft.hidden.includes(id);
              const Icon = WIDGET_ICONS[id];
              return (
                <li
                  key={id}
                  data-dragging={dragId === id ? "1" : undefined}
                  data-drop-target={
                    overId === id && dragId !== id ? "1" : undefined
                  }
                  className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm data-[dragging=1]:opacity-40 data-[drop-target=1]:border-cyan-500/50"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverId(id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragId) return;
                    setDraft((prev) => ({
                      ...prev,
                      order: moveInOrder(prev.order, dragId, id),
                    }));
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-cyan-400 hover:bg-zinc-800"
                    title={hidden ? "Einblenden" : "Ausblenden"}
                    aria-label={`${LABELS[id]} ${hidden ? "einblenden" : "ausblenden"}`}
                    aria-pressed={!hidden}
                    onClick={() => toggleHidden(id)}
                  >
                    {hidden ? (
                      <EyeOff className="size-4 text-zinc-500" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                  <span className="flex min-w-0 flex-1 items-center gap-2 font-medium text-zinc-100">
                    <Icon className="size-4 shrink-0 text-zinc-400" aria-hidden />
                    {LABELS[id]}
                  </span>
                  <button
                    type="button"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-cyan-400 cursor-grab active:cursor-grabbing"
                    title="Verschieben"
                    aria-label={`${LABELS[id]} verschieben`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", id);
                      setDragId(id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <GripVertical className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {HOME_WIDGET_IDS.every((id) => draft.hidden.includes(id)) ? (
            <p className="text-xs text-amber-400">
              Mindestens ein Widget sichtbar lassen — sonst leeres Dashboard.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-8">
        {visible.map((id) => (
          <div key={id}>{renderWidget(id)}</div>
        ))}
        {visible.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Dashboard ist leer"
            description="Alle Widgets sind ausgeblendet. Layout öffnen und wieder einblenden."
          />
        ) : null}
      </div>
    </div>
  );
}
