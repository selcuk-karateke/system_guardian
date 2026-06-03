export function MockDataBanner() {
  return (
    <div className="rounded-lg border border-amber-900/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/90">
      <strong>Testmodus (CHECK_MODE=mock)</strong> – CPU, RAM, Uptime (z. B. „45d“),
      Docker und RAID sind <strong>feste Demo-Werte</strong>, nicht dein Server nach
      dem Reboot. Für echte Uptime: <code className="text-amber-50">CHECK_MODE=ssh</code>{" "}
      setzen und „Alle Checks“ ausführen.
    </div>
  );
}
