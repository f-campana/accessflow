import { pool } from "./client";
import { resetDemoDatabase } from "./demo-reset";

const target = await resetDemoDatabase();

console.log(
  `Reset local demo database: ${target.databaseName} (${target.host}:${target.port})`
);

await pool.end();
