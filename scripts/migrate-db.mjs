#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");

const cmd = (process.argv[2] || "status").toLowerCase();
const connectionString =
  (process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim();

if (!connectionString) {
  console.error("Missing POSTGRES_URL or DATABASE_URL environment variable.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: /sslmode=require/i.test(connectionString) || process.env.POSTGRES_SSL === "true"
    ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRes = await client.query("SELECT version, applied_at FROM schema_migrations ORDER BY version ASC");
    const applied = new Set(appliedRes.rows.map((r) => r.version));

    if (cmd === "status") {
      console.log("Applied migrations:", appliedRes.rows);
      return;
    }

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();

    if (cmd === "up") {
      for (const file of files) {
        const version = file.replace(/\.sql$/, "");
        if (applied.has(version)) {
          console.log(`[skip] ${version} already applied`);
          continue;
        }
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
        console.log(`[up] Applying ${version}...`);
        await client.query(sql);
        console.log(`[ok] Applied ${version}`);
      }
      return;
    }

    if (cmd === "down") {
      const reversed = [...files].reverse();
      for (const file of reversed) {
        const version = file.replace(/\.sql$/, "");
        if (!applied.has(version)) continue;
        const downFile = path.join(MIGRATIONS_DIR, `${version}.down.sql`);
        if (!fs.existsSync(downFile)) {
          throw new Error(`Missing down migration file: ${downFile}`);
        }
        const sql = fs.readFileSync(downFile, "utf8");
        console.log(`[down] Rolling back ${version}...`);
        await client.query(sql);
        console.log(`[ok] Rolled back ${version}`);
        break;
      }
      return;
    }

    console.error("Usage: node scripts/migrate-db.mjs [up|down|status]");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
