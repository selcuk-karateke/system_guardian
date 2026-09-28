"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    Redoc?: {
      init: (
        specOrSpecUrl: string,
        options: Record<string, unknown>,
        element: HTMLElement,
      ) => void;
    };
  }
}

const REDOC_SRC =
  "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";

/** Dark theme aligned with Ops Console (zinc + sky). */
const REDOC_DARK_THEME = {
  colors: {
    primary: { main: "#38bdf8" },
    success: { main: "#4ade80" },
    warning: { main: "#fbbf24" },
    error: { main: "#f87171" },
    text: {
      primary: "#e4e4e7",
      secondary: "#a1a1aa",
    },
    border: { dark: "#3f3f46", light: "#27272a" },
    responses: {
      success: { color: "#4ade80", backgroundColor: "rgba(74,222,128,0.08)" },
      error: { color: "#f87171", backgroundColor: "rgba(248,113,113,0.08)" },
      redirect: { color: "#38bdf8", backgroundColor: "rgba(56,189,248,0.08)" },
      info: { color: "#a1a1aa", backgroundColor: "rgba(161,161,170,0.08)" },
    },
    http: {
      get: "#4ade80",
      post: "#38bdf8",
      put: "#fbbf24",
      options: "#a1a1aa",
      patch: "#c084fc",
      delete: "#f87171",
      basic: "#a1a1aa",
      link: "#38bdf8",
      head: "#a1a1aa",
    },
  },
  sidebar: {
    backgroundColor: "#18181b",
    textColor: "#e4e4e7",
    activeTextColor: "#38bdf8",
    groupItems: {
      activeBackgroundColor: "#27272a",
      activeTextColor: "#38bdf8",
      textTransform: "none",
    },
    level1Items: {
      activeBackgroundColor: "#27272a",
      activeTextColor: "#38bdf8",
      textTransform: "none",
    },
  },
  rightPanel: {
    backgroundColor: "#09090b",
    textColor: "#e4e4e7",
  },
  typography: {
    fontSize: "14px",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    fontWeightRegular: "400",
    fontWeightBold: "600",
    fontWeightLight: "300",
    headings: {
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      fontWeight: "600",
      lineHeight: "1.4em",
    },
    code: {
      fontSize: "13px",
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      color: "#e4e4e7",
      backgroundColor: "#27272a",
      wrap: true,
    },
    links: {
      color: "#38bdf8",
      visited: "#38bdf8",
      hover: "#7dd3fc",
    },
  },
  schema: {
    nestedBackground: "#18181b",
    typeNameColor: "#a1a1aa",
    typeTitleColor: "#e4e4e7",
  },
};

export function RedocViewer({ specUrl }: { specUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    const init = () => {
      if (cancelled || !containerRef.current || !window.Redoc) return;
      containerRef.current.innerHTML = "";
      window.Redoc.init(
        specUrl,
        {
          scrollYOffset: 0,
          hideDownloadButton: false,
          theme: REDOC_DARK_THEME,
        },
        containerRef.current,
      );
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${REDOC_SRC}"]`,
    );
    if (existing && window.Redoc) {
      init();
      return () => {
        cancelled = true;
      };
    }

    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = REDOC_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener("load", init);
    if (window.Redoc) init();

    return () => {
      cancelled = true;
      script.removeEventListener("load", init);
    };
  }, [specUrl]);

  return (
    <div
      ref={containerRef}
      className="redoc-wrap redoc-dark min-h-[70vh] rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden"
    />
  );
}
