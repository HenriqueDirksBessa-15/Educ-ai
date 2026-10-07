import { join } from "node:path";

import { loadConfig, loadRootEnvironment } from "../config.js";
import { createDatabasePool } from "../database.js";
import { runMigrations } from "./migrations.js";
import { findRepositoryRoot } from "./paths.js";

loadRootEnvironment();
const config = loadConfig(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  const applied = await runMigrations(
    pool,
    join(findRepositoryRoot(), "database", "migrations"),
  );
  console.log(
    applied.length === 0
      ? "Banco já estava atualizado."
      : `Migrações aplicadas: ${applied.join(", ")}`,
  );
} finally {
  await pool.end();
}
