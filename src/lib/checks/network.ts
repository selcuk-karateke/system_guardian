import { runPortsCheck } from "./ports";

/** Network monitoring extends port monitoring with public listener focus */
export async function runNetworkCheck(serverId: string) {
  const portsResult = await runPortsCheck(serverId);
  const publicPorts = ((portsResult.data.ports as string[]) ?? []).filter((p) =>
    ["22", "80", "443", "3000", "8080", "5432", "3306"].includes(p),
  );

  const alerts = [...portsResult.alerts];
  const extraPorts = ((portsResult.data.ports as string[]) ?? []).filter(
    (p) => !["22", "80", "443"].includes(p),
  );

  if (extraPorts.length > 5) {
    alerts.push({
      level: "info",
      message: `${extraPorts.length} non-standard ports listening`,
    });
  }

  return {
    ...portsResult,
    module: "network",
    data: {
      ...portsResult.data,
      publicPorts,
      listenerCount: (portsResult.data.ports as string[])?.length ?? 0,
    },
    alerts,
  };
}
