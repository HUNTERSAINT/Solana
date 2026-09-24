import { assertConfiguration } from "./config.js";
import { initSchema, pool } from "./db.js";

try {
  assertConfiguration();
  await initSchema();
  console.log("Database schema is ready.");
} finally {
  await pool.end();
}