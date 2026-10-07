import { join } from "node:path";

import { loadConfig, loadRootEnvironment } from "../config.js";
import { createDatabasePool } from "../database.js";
import { findRepositoryRoot } from "./paths.js";
import { runSeeds } from "./seeds.js";

loadRootEnvironment();
const config = loadConfig(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  const executed = await runSeeds(
    pool,
    join(findRepositoryRoot(), "database", "seeds"),
  );
  console.log(`Seeds executadas de forma idempotente: ${executed.join(", ")}`);
} finally {
  await pool.end();
}
