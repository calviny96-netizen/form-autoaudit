import pg from "pg";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
const file = "/home/oem/.local/share/auto-audit-interview/qa.json";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (process.argv[2] === "cleanup") {
  const f = JSON.parse(readFileSync(file, "utf8"));
  const assets = (await db.query("SELECT filename FROM uploaded_assets WHERE company_id=$1", [f.company.id])).rows;
  await db.query("BEGIN");
  for (const t of [
    "audit_logs",
    "form_responses",
    "forms",
    "bookings",
    "interview_slots",
    "form_versions",
    "campaigns",
    "company_memberships",
    "roles",
    "uploaded_assets",
  ])
    await db.query(`DELETE FROM ${t} WHERE company_id=$1`, [f.company.id]);
  await db.query("DELETE FROM audit_logs WHERE actor_id=$1", [f.user]);
  await db.query("DELETE FROM companies WHERE id=$1", [f.company.id]);
  if (f.company.registered_by) {
    await db.query("DELETE FROM audit_logs WHERE actor_id=$1", [f.company.registered_by]);
    await db.query("DELETE FROM sessions WHERE user_id=$1 OR acting_user_id=$1", [f.company.registered_by]);
    await db.query("DELETE FROM access_tokens WHERE user_id=$1", [f.company.registered_by]);
    await db.query("DELETE FROM users WHERE id=$1", [f.company.registered_by]);
  }
  await db.query("DELETE FROM sessions WHERE user_id=$1", [f.user]);
  await db.query("DELETE FROM users WHERE id=$1", [f.user]);
  await db.query("COMMIT");
  await db.end();
  for (const a of assets) {
    const asset = path.join(process.env.UPLOAD_DIR, a.filename);
    if (existsSync(asset)) unlinkSync(asset);
  }
  unlinkSync(file);
  console.log("QA fixture cleaned");
  process.exit(0);
}
if (existsSync(file)) throw Error("QA fixture exists; run cleanup before creating another.");
const email = "qa-" + randomUUID() + "@example.test",
  password = randomBytes(18).toString("hex"),
  salt = randomBytes(32).toString("hex");
const user = (
  await db.query(
    "INSERT INTO users(email,name,password_hash,super_admin) VALUES($1,$2,$3,true) RETURNING id",
    [
      email,
      "Pengelola Uji",
      salt + ":" + scryptSync(password, salt, 64).toString("hex"),
    ],
  )
).rows[0].id;
const login = await fetch(process.env.APP_URL + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];
async function api(path, data) {
  const r = await fetch(process.env.APP_URL + "/api/" + path, {
    method: data ? "POST" : "GET",
    headers: { cookie, "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw Error(JSON.stringify(b));
  return b;
}
const company = await api("platform/companies", {
  name: "Company Uji Penerimaan",
  slug: "uji-penerimaan",
  contact: "qa@example.test",
  email: "qa-owner-" + randomUUID() + "@example.test",
  phone: "628899" + Date.now().toString().slice(-9),
  password,
  confirm_password: password,
  timezone: "Asia/Jakarta",
  status: "active",
});
const campaign = await api(`companies/${company.id}/campaigns`, {
  title: "Interview Tim Operasional",
  slug: "operasional-oktober",
  description:
    "Pilih jadwal interview dan lengkapi data Anda. Siapkan pengalaman kerja yang ingin Anda ceritakan kepada tim.",
  position: "Operations Staff",
  location: "Kantor company · Jakarta",
  timezone: "Asia/Jakarta",
  status: "published",
  fields: [
    {
      id: "experience",
      label: "Ceritakan pengalaman Anda",
      type: "textarea",
      required: true,
      options: [],
    },
  ],
});
const start = new Date();
start.setUTCDate(start.getUTCDate() + 7);
start.setUTCHours(2, 0, 0, 0);
await api(`companies/${company.id}/slots`, {
  campaign_id: campaign.id,
  slots: [
    {
      starts_at: start.toISOString(),
      ends_at: new Date(+start + 3600000).toISOString(),
      capacity: 20,
    },
    {
      starts_at: new Date(+start + 14400000).toISOString(),
      ends_at: new Date(+start + 18000000).toISOString(),
      capacity: 10,
    },
  ],
});
await api(`companies/${company.id}/settings`, { phone: "6281234567890" });
writeFileSync(
  file,
  JSON.stringify({ email, password, user, company, campaign, cookie }),
  { mode: 0o600 },
);
console.log(
  "QA fixture created; public URL: " +
    process.env.APP_URL +
    "/b/" +
    company.slug +
    "/" +
    campaign.slug,
);
await db.end();
