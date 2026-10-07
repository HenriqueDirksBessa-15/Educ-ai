import { Pool } from "pg";

export interface DatabaseClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export function createDatabasePool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    application_name: "educai-api",
  });
}

export async function isDatabaseAvailable(
  database: DatabaseClient,
): Promise<boolean> {
  try {
    await database.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
