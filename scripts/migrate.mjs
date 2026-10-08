import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
);
for (const name of (await readdir("migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  if (
    (await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
      .rowCount
  )
    continue;
  await db.query("BEGIN");
  try {
    await db.query(await readFile(`migrations/${name}`, "utf8"));
    await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    await db.query("COMMIT");
    console.log("Applied", name);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
await db.end();
