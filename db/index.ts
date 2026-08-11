import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import fs from "fs";
import path from "path";

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

const DEFAULT_DATABASE_URL = "postgresql://postgres:ah98yj0WFvITCDVC@db.edwdzsrfvzefxulsxgcf.supabase.co:5432/postgres";

function loadEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;

  const currentDir = path.resolve(/* turbopackIgnore: true */ process.cwd());
  const possiblePaths = [
    path.join(currentDir, ".env"),
    path.join(currentDir, "..", ".env"),
    path.join(currentDir, "..", "..", ".env"),
    path.join(currentDir, "..", "..", "..", ".env"),
    path.join(currentDir, "..", "..", "..", "..", ".env"),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf8");
        content.split(/\r?\n/).forEach((line) => {
          if (line.trim().startsWith("#") || !line.includes("=")) return;
          const parts = line.split("=");
          const key = parts[0].trim();
          let value = parts.slice(1).join("=").trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        });
        if (process.env.DATABASE_URL) break;
      } catch {
        // ignore
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  }
}

export function getDb() {
  if (!dbInstance) {
    loadEnvIfNeeded();
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || DEFAULT_DATABASE_URL;
    const client = postgres(connectionString, { prepare: false });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const instance = getDb();
    return (instance as any)[prop];
  },
});
