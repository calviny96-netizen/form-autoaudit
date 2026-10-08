import { execFileSync } from "node:child_process";
import { mkdirSync, createWriteStream, chmodSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const root = "/home/oem/.local/share/auto-audit-interview/backups";
mkdirSync(root, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join(root, stamp);
mkdirSync(dir, { mode: 0o700 });
// ponytail: use a streaming dump when the compressed database approaches 256 MB.
const dump = execFileSync(
  "docker",
  [
    "exec",
    "pgvector-db",
    "sh",
    "-c",
    'pg_dump -U "$POSTGRES_USER" -d auto_audit_interview -Fc --no-owner --no-acl',
  ],
  { maxBuffer: 256 * 1024 * 1024 },
);
const { writeFileSync } = await import("node:fs");
writeFileSync(path.join(dir, "database.dump"), dump, { mode: 0o600 });
execFileSync("tar", [
  "-czf",
  path.join(dir, "uploads.tar.gz"),
  "-C",
  process.env.UPLOAD_DIR,
  ".",
]);
chmodSync(path.join(dir, "uploads.tar.gz"), 0o600);
console.log(dir);
