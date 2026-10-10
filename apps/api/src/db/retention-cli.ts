import { loadConfig, loadRootEnvironment } from "../config.js";
import { createDatabasePool } from "../database.js";
import { RetentionService } from "../privacy/retention.js";

loadRootEnvironment();
const config = loadConfig(process.env);
const pool = createDatabasePool(config.databaseUrl);

try {
  const result = await new RetentionService(
    pool,
    config.dataRetentionDays,
  ).run();
  console.info(JSON.stringify({ status: "completed", ...result }));
} finally {
  await pool.end();
}
