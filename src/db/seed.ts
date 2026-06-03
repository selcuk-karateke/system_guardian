import { db } from "./index";
import { monitoredDomains, servers } from "./schema";

async function seed() {
  const existing = await db.select().from(servers).limit(1);
  if (existing.length === 0) {
    await db.insert(servers).values({
      name: "Primary Server",
      host: process.env.SSH_HOST ?? "localhost",
      ipv4: process.env.SSH_HOST,
    });
    console.log("Seeded default server");
  }

  const domains = [
    "kawai-labs.com",
    "dachpro.kawai-labs.com",
    "app.dachfabrik.com",
  ];

  for (const domain of domains) {
    try {
      await db.insert(monitoredDomains).values({ domain });
      console.log(`Seeded domain: ${domain}`);
    } catch {
      console.log(`Domain exists: ${domain}`);
    }
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
