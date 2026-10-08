import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
if (existsSync(".env")) throw Error(".env already exists");
const password = randomBytes(32).toString("hex");
const sql = `CREATE ROLE auto_audit_interview LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE; CREATE DATABASE auto_audit_interview OWNER auto_audit_interview; REVOKE ALL ON DATABASE auto_audit_interview FROM PUBLIC;`;
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
  { input: sql, stdio: ["pipe", "inherit", "inherit"] },
);
mkdirSync("/home/oem/.local/share/auto-audit-interview/uploads", {
  recursive: true,
  mode: 0o700,
});
writeFileSync(
  ".env",
  `DATABASE_URL=postgresql://auto_audit_interview:${password}@127.0.0.1:5432/auto_audit_interview\nAPP_URL=http://localhost:3210\nUPLOAD_DIR=/home/oem/.local/share/auto-audit-interview/uploads\nCOOKIE_SECURE=false\n`,
  { mode: 0o600 },
);
