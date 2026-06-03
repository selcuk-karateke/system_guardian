/**
 * Schreibt SSH_PRIVATE_KEY aus .env.local nach secrets/id_ed25519
 * Einmalig: pnpm setup:ssh-key
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const target = resolve(process.cwd(), "secrets", "id_ed25519");
const raw = process.env.SSH_PRIVATE_KEY?.trim();

if (!raw) {
  console.error("SSH_PRIVATE_KEY fehlt in .env.local");
  process.exit(1);
}

let key = raw.replace(/\\n/g, "\n");
if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);

if (!key.includes("BEGIN OPENSSH PRIVATE KEY") && !key.includes("BEGIN RSA PRIVATE KEY")) {
  console.error("SSH_PRIVATE_KEY sieht ungültig aus (kein PEM-Header)");
  process.exit(1);
}

mkdirSync(resolve(process.cwd(), "secrets"), { recursive: true });
writeFileSync(target, key.endsWith("\n") ? key : `${key}\n`, { mode: 0o600 });

console.log(`OK: Key gespeichert unter ${target}`);
console.log("In .env.local: SSH_PRIVATE_KEY_PATH=./secrets/id_ed25519");
console.log("Optional: mehrzeiliges SSH_PRIVATE_KEY= auskommentieren.");
console.log("Test: pnpm test:ssh");
