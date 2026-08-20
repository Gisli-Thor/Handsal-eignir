import { execSync } from "node:child_process";
import "dotenv/config";
import { Client } from "pg";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://handsal:handsal@localhost:5432/handsal_test";

/** Creates the test database if missing and applies all migrations. */
export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, "");

  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach Postgres at ${adminUrl.host}. Start it with "npm run db:up" (requires Docker Desktop). Original error: ${String(error)}`,
    );
  }
  try {
    const exists = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName],
    );
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
