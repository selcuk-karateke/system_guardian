export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureRuntimeConfig } = await import("@/lib/runtime-config");
    await ensureRuntimeConfig();
  } catch {
    /* DB may be down at boot — hydrate on first check/request */
  }
}
