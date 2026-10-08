import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const file = process.argv[2];
if (!file)
  throw Error("Usage: node scripts/restore-check.mjs /path/database.dump");
const name = "aa_interview_restore_" + Date.now();
const sql = (s) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "pgvector-db",
      "sh",
      "-c",
      'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres',
    ],
    { input: s },
  );
sql(
  `CREATE DATABASE ${name} OWNER auto_audit_interview; REVOKE ALL ON DATABASE ${name} FROM PUBLIC;`,
);
try {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "pgvector-db",
      "sh",
      "-c",
      `pg_restore -U "$POSTGRES_USER" --role=auto_audit_interview -d ${name} --no-owner --no-acl --exit-on-error`,
    ],
    { input: readFileSync(file) },
  );
  const result = execFileSync(
    "docker",
    [
      "exec",
      "pgvector-db",
      "sh",
      "-c",
      `psql -U "$POSTGRES_USER" -d ${name} -Atc "SELECT 'users='||count(*) FROM users; SELECT 'companies='||count(*) FROM companies; SELECT 'bookings='||count(*) FROM bookings; SELECT 'migrations='||count(*) FROM schema_migrations; SELECT 'settings='||count(*) FROM platform_settings;"`,
    ],
    { encoding: "utf8" },
  );
  console.log("Restore verified in isolated database\n" + result);
  const uploads = mkdtempSync(path.join(tmpdir(), "aa-restore-"));
  try {
    execFileSync("tar", ["-xzf", path.join(path.dirname(file), "uploads.tar.gz"), "-C", uploads]);
    const assets = execFileSync("docker", ["exec", "pgvector-db", "sh", "-c", `psql -U "$POSTGRES_USER" -d ${name} -Atc "SELECT filename FROM uploaded_assets"`], {encoding:"utf8"}).trim().split("\n").filter(Boolean);
    for (const asset of assets) if (!existsSync(path.join(uploads, asset))) throw Error("Missing restored logo");
    console.log(`Restored assets verified: ${assets.length}`);
  } finally { rmSync(uploads, {recursive:true, force:true}); }
} finally {
  sql(`DROP DATABASE ${name};`);
}
