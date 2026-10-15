import { Pool } from "pg";

export interface QueryClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export interface DatabaseClient extends QueryClient {
  connect?: () => Promise<TransactionClient>;
}

export interface TransactionClient extends QueryClient {
  release(): void;
}

export async function withTransaction<T>(
  database: DatabaseClient,
  operation: (client: QueryClient) => Promise<T>,
): Promise<T> {
  if (!database.connect) return operation(database);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
