import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
const email = (process.argv[2] || "owner@autoaudit.local").toLowerCase();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if ((await db.query("SELECT 1 FROM users WHERE super_admin")).rowCount)
  throw Error("Super Admin sudah ada; gunakan reset akses.");
const t = randomBytes(32).toString("hex");
const u = (
  await db.query(
    "INSERT INTO users(email,name,super_admin) VALUES($1,$2,true) RETURNING id",
    [email, "Pengelola Auto Audit"],
  )
).rows[0];
await db.query(
  "INSERT INTO access_tokens VALUES($1,$2,now()+interval '24 hours',NULL)",
  [createHash("sha256").update(t).digest("hex"), u.id],
);
const file = "/home/oem/.local/share/auto-audit-interview/akses-awal.txt";
writeFileSync(
  file,
  `Buka tautan sekali pakai untuk membuat password (berlaku 24 jam):\n${process.env.APP_URL}/activate#${t}\nEmail: ${email}\n`,
  { mode: 0o600 },
);
console.log("Tautan aktivasi disimpan di", file);
await db.end();
