import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 does not load .env files. Mirror Next.js: .env.local first, then .env.
// process.loadEnvFile never overwrites variables that are already set (Railway, CI, a shell export).
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts", // the ONLY place Prisma 7 reads the seed command from
  },
  datasource: {
    // process.env (not env()) so `prisma generate` works without a URL (CI, `pnpm build` on a fresh clone).
    // If a PgBouncer is added later, point DIRECT_DATABASE_URL at Postgres itself.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  },
});
