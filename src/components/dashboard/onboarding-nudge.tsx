"use client";

import Link from "next/link";
import { Check, Monitor, Play, Server, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "sg-onboarding-dismissed";

type Step = {
  id: string;
  label: string;
  href?: string;
  done: boolean;
  icon: typeof Server;
};

type Props = {
  hasServers: boolean;
  checkMode: string;
};

export function OnboardingNudge({ hasServers, checkMode }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setVisible(false);
        return;
      }
    } catch {
      /* private mode */
    }
    // Hide once live SSH + at least one server — setup complete.
    if (hasServers && checkMode === "ssh") {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [hasServers, checkMode]);

  if (!visible) return null;

  const steps: Step[] = [
    {
      id: "server",
      label: "Server anlegen",
      href: "/settings#servers",
      done: hasServers,
      icon: Server,
    },
    {
      id: "ssh",
      label: checkMode === "ssh" ? "SSH aktiv" : "CHECK_MODE=ssh setzen",
      href: "/docs/sysadmin",
      done: checkMode === "ssh",
      icon: Play,
    },
    {
      id: "monitor",
      label: "Monitor öffnen",
      href: "/monitor",
      done: false,
      icon: Monitor,
    },
  ];

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  const title = !hasServers
    ? "Willkommen — Setup in 3 Schritten"
    : checkMode === "mock"
      ? "Fast fertig — Live-Daten aktivieren"
      : "Nächster Schritt";

  return (
    <section
      className="sg-onboard relative rounded-xl border border-sky-800/40 bg-sky-950/20 px-4 py-4 sm:px-5"
      aria-label="Onboarding"
    >
      <button
        type="button"
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        onClick={dismiss}
        title="Ausblenden"
        aria-label="Onboarding ausblenden"
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="pr-8 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-sky-100">{title}</h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
            {!hasServers
              ? "Ohne Host bleiben Dashboard und Monitor leer. Leg den ersten Server an, dann Checks und Alerts."
              : checkMode === "mock"
                ? "Du siehst noch Demo-Werte. Mit SSH und einem Check-Lauf kommen echte Metriken."
                : "Öffne den Monitor für die TV-/HUD-Ansicht."}
          </p>
        </div>

        <ol className="grid gap-2 sm:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const body = (
              <>
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                    step.done
                      ? "border-emerald-700/50 bg-emerald-500/10 text-emerald-400"
                      : "border-sky-800/50 bg-sky-500/10 text-sky-300",
                  )}
                >
                  {step.done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Icon className="size-3.5" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-zinc-500">
                    Schritt {i + 1}
                  </span>
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      step.done ? "text-zinc-400 line-through" : "text-zinc-100",
                    )}
                  >
                    {step.label}
                  </span>
                </span>
              </>
            );

            if (step.href && !step.done) {
              return (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5 transition hover:border-sky-700/50 hover:bg-zinc-900/60"
                  >
                    {body}
                  </Link>
                </li>
              );
            }

            return (
              <li
                key={step.id}
                className="flex items-center gap-2.5 rounded-lg border border-zinc-800/50 bg-zinc-950/25 px-3 py-2.5"
              >
                {body}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
