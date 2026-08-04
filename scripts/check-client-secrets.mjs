import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const clientRoot = join(process.cwd(), ".next", "static");
const sensitiveNames = [
  "SUPABASE_SERVICE_ROLE",
  "ANTHROPIC_API_KEY",
  "VOYAGE_API_KEY",
  "ASAAS_API_KEY",
  "ASAAS_WEBHOOK_TOKEN",
  "RESEND_API_KEY",
  "INTERNAL_PYTHON_TOKEN",
  "RATE_LIMIT_HASH_SECRET",
  "OPS_ALERT_EMAIL",
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

try {
  await stat(clientRoot);
} catch {
  throw new Error("CLIENT_BUNDLE_NAO_ENCONTRADO");
}

const secrets = sensitiveNames
  .map((name) => ({ name, value: process.env[name] }))
  .filter(({ value }) => typeof value === "string" && value.length >= 8);

const leaked = new Set();
for (const path of await files(clientRoot)) {
  const content = await readFile(path);
  for (const secret of secrets) {
    if (content.includes(Buffer.from(secret.value))) leaked.add(secret.name);
  }
}

if (leaked.size > 0) {
  throw new Error(`SEGREDO_NO_BUNDLE_CLIENTE:${[...leaked].sort().join(",")}`);
}

console.log(`Client bundle secret scan: ${secrets.length} valores verificados, zero vazamentos.`);
