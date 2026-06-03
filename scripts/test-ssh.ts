/**
 * SSH-Verbindung testen: npx tsx scripts/test-ssh.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { getSshClient, resetSshClient } from "../src/lib/ssh";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

async function main() {
  console.log("CHECK_MODE:", process.env.CHECK_MODE);
  console.log("SSH_HOST:", process.env.SSH_HOST);
  console.log("SSH_USER:", process.env.SSH_USER);
  console.log("SSH_PRIVATE_KEY_PATH:", process.env.SSH_PRIVATE_KEY_PATH ?? "(inline)");
  resetSshClient();
  const ssh = getSshClient();
  const uptime = await ssh.exec("uptime");
  console.log("OK – uptime:", uptime.stdout.trim());
  process.exit(0);
}

main().catch((e) => {
  console.error("SSH FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
