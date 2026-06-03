import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLatestCheckByModule } from "@/lib/dashboard-data";

export default async function DockerPage() {
  let docker: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;
  let coolify: Awaited<ReturnType<typeof getLatestCheckByModule>> | undefined;

  try {
    docker = await getLatestCheckByModule("docker");
    coolify = await getLatestCheckByModule("coolify");
  } catch {
    /* empty */
  }

  const containers =
    (docker?.data as { containers?: Array<{ Names: string; Status: string; State: string }> })
      ?.containers ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Docker</h1>

      <div className="flex gap-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Container</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400 mb-4">
              Running: {(docker?.data as { running?: number })?.running ?? 0} /
              Total: {(docker?.data as { total?: number })?.total ?? 0}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 text-left">
                  <th className="pb-2">Name</th>
                  <th>State</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c) => (
                  <tr key={c.Names} className="border-t border-zinc-800">
                    <td className="py-2">{c.Names}</td>
                    <td>
                      <Badge
                        variant={
                          c.State === "running"
                            ? "healthy"
                            : c.State === "exited"
                              ? "warning"
                              : "critical"
                        }
                      >
                        {c.State}
                      </Badge>
                    </td>
                    <td className="text-zinc-400">{c.Status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="w-80">
          <CardHeader>
            <CardTitle>Coolify</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.entries(
              (coolify?.data as { services?: Record<string, string> })?.services ??
                {},
            ).map(([name, state]) => (
              <div key={name} className="flex justify-between">
                <span>{name}</span>
                <Badge variant={state === "running" ? "healthy" : "critical"}>
                  {state}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
