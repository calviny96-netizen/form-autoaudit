import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const f = JSON.parse(
  readFileSync("/home/oem/.local/share/auto-audit-interview/qa.json", "utf8"),
);
const base = process.env.APP_URL;
const headers = { cookie: f.cookie };
const fd = new FormData();
fd.set(
  "file",
  new Blob([readFileSync("/home/oem/Pictures/logo-auto-audit.png")], {
    type: "image/png",
  }),
  "logo.png",
);
let r = await fetch(`${base}/api/companies/${f.company.id}/logo`, {
  method: "POST",
  headers,
  body: fd,
});
assert.equal(r.status, 200);
const logo = await r.json();
assert.equal(
  (await fetch(base + logo.url)).headers.get("content-type"),
  "image/webp",
);
const bad = new FormData();
bad.set(
  "file",
  new Blob(["<script>test</script>"], { type: "image/png" }),
  "fake.png",
);
assert.equal(
  (
    await fetch(`${base}/api/companies/${f.company.id}/logo`, {
      method: "POST",
      headers,
      body: bad,
    })
  ).status,
  400,
);
r = await fetch(`${base}/api/companies/${f.company.id}/branding`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({
    primary: "#075985",
    accent: "#7DD3FC",
    background: "#F0F9FF",
    heading: "Interview Tim Operasional",
    intro: "Pilih jadwal interview yang sesuai untuk Anda.",
  }),
});
assert.equal(r.status, 200);
const pub = await (
  await fetch(`${base}/api/public/${f.company.slug}/${f.campaign.slug}`)
).json();
assert.equal(pub.company.branding.primary, "#075985");
assert.equal(pub.company.branding.logo, logo.url);
assert.equal(pub.slots[0].remaining, 19);
const csv = await (
  await fetch(`${base}/api/companies/${f.company.id}/bookings?export=1`, {
    headers,
  })
).text();
assert.ok(csv.includes("Peserta Uji Browser"));
const logs = await (
  await fetch(`${base}/api/platform/audit`, { headers })
).json();
assert.ok(logs.some((x) => x.action === "super_admin.participants.read"));
assert.equal(
  (await fetch(`${base}/api/companies/${f.company.id}/bookings`)).status,
  401,
);
console.log(
  "HTTP QA passed: logo upload/signature, branding public reflection, persisted booking, CSV, audited Super Admin access, auth guard",
);
