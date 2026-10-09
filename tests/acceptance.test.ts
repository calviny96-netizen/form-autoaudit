import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../lib/db";
import { createBooking, changeBooking } from "../lib/booking";
import { handle } from "../lib/api";
import { hash, token, passwordHash } from "../lib/auth";
import { permissions, success, whatsapp, branding } from "../lib/schema";
let cid: string,
  other: string,
  campaign: string,
  slot: string,
  slot2: string,
  uid: string,
  viewer: string,
  session: string,
  viewSession: string;
const ids: string[] = [];
const req = async (
  path: string,
  method = "GET",
  data?: any,
  cookie = session,
) =>
  handle(
    new Request(process.env.APP_URL + "/api/" + path, {
      method,
      headers: {
        cookie: "aa_session=" + cookie,
        "Content-Type": "application/json",
        origin: new URL(process.env.APP_URL!).origin,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    path.split("?")[0].split("/"),
  );
const body = (i: number, s = slot) => ({
  slot_id: s,
  idempotency_key: randomUUID(),
  name: "Peserta " + i,
  email: `person-${i}@example.test`,
  phone: "081234567890",
  consent: true,
  answers: { question: "Jawaban lama" },
});
before(async () => {
  const a = (
    await pool.query(
      "INSERT INTO users(email,name,password_hash) VALUES($1,'Test Owner',$2) RETURNING id",
      [
        "test-" + randomUUID() + "@example.test",
        passwordHash("temporary-password-123"),
      ],
    )
  ).rows[0];
  uid = a.id;
  viewer = (
    await pool.query(
      "INSERT INTO users(email,name) VALUES($1,'Test Viewer') RETURNING id",
      ["test-" + randomUUID() + "@example.test"],
    )
  ).rows[0].id;
  for (let i = 0; i < 2; i++) {
    const c = (
      await pool.query(
        "INSERT INTO companies(name,slug) VALUES('Acceptance test',$1) RETURNING id",
        ["test-" + randomUUID()],
      )
    ).rows[0];
    ids.push(c.id);
  }
  [cid, other] = ids;
  const r = (
    await pool.query(
      "INSERT INTO roles(company_id,name,owner,permissions) VALUES($1,'Owner',true,$2) RETURNING id",
      [cid, permissions],
    )
  ).rows[0];
  const vr = (
    await pool.query(
      "INSERT INTO roles(company_id,name,permissions) VALUES($1,'Viewer',$2) RETURNING id",
      [cid, ["campaigns.read", "slots.read", "bookings.read"]],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO company_memberships(company_id,user_id,role_id) VALUES($1,$2,$3),($1,$4,$5)",
    [cid, uid, r.id, viewer, vr.id],
  );
  session = token();
  viewSession = token();
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
    [hash(session), uid, hash(viewSession), viewer],
  );
  const fields = JSON.stringify([
    {
      id: "question",
      label: "Pertanyaan lama",
      type: "text",
      required: true,
      options: [],
    },
  ]);
  campaign = (
    await pool.query(
      "INSERT INTO campaigns(company_id,title,slug,status,fields) VALUES($1,'Test','test','published',$2) RETURNING id",
      [cid, fields],
    )
  ).rows[0].id;
  await pool.query("INSERT INTO form_versions VALUES($1,$2,1,$3,now())", [
    cid,
    campaign,
    fields,
  ]);
  slot = (
    await pool.query(
      "INSERT INTO interview_slots(company_id,campaign_id,starts_at,ends_at,capacity) VALUES($1,$2,now()+interval '30 days',now()+interval '30 days 1 hour',10) RETURNING id",
      [cid, campaign],
    )
  ).rows[0].id;
  slot2 = (
    await pool.query(
      "INSERT INTO interview_slots(company_id,campaign_id,starts_at,ends_at,capacity) VALUES($1,$2,now()+interval '31 days',now()+interval '31 days 1 hour',1) RETURNING id",
      [cid, campaign],
    )
  ).rows[0].id;
});
after(async () => {
  for (const table of [
    "audit_logs",
    "bookings",
    "interview_slots",
    "form_versions",
    "campaigns",
    "company_memberships",
    "roles",
    "uploaded_assets",
  ])
    await pool.query(`DELETE FROM ${table} WHERE company_id=ANY($1::uuid[])`, [
      ids,
    ]);
  await pool.query("DELETE FROM companies WHERE id=ANY($1::uuid[])", [ids]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [uid, viewer],
  ]);
  await pool.query("DELETE FROM access_tokens WHERE user_id=ANY($1::uuid[])", [
    [uid, viewer],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [uid, viewer],
  ]);
  await pool.end();
});
test("tenant isolation and viewer authorization", async () => {
  assert.equal((await req(`companies/${other}/campaigns`)).status, 403);
  const r = await req(
    `companies/${cid}/slots`,
    "POST",
    { campaign_id: campaign, slots: [] },
    viewSession,
  );
  assert.equal(r.status, 403);
});
test("50 concurrent submissions allocate exactly 10 seats", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 50 }, (_, i) => createBooking(cid, campaign, body(i))),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 10);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM bookings WHERE slot_id=$1 AND status<>'cancelled'",
        [slot],
      )
    ).rows[0].n,
    10,
  );
});
test("per-slot capacity, double submit and lost response replay", async () => {
  const b = body(100, slot2);
  const [a, c] = await Promise.all([
    createBooking(cid, campaign, b),
    createBooking(cid, campaign, b),
  ]);
  assert.equal(a.token, c.token);
  assert.deepEqual(await createBooking(cid, campaign, b), a);
  await assert.rejects(
    () => createBooking(cid, campaign, { ...b, name: "Changed" }),
    /Permintaan berubah/,
  );
  await assert.rejects(
    () => createBooking(cid, campaign, body(101, slot2)),
    /kursi terakhir/,
  );
});
test("failed move is atomic and cancellation is repeatable", async () => {
  const b = (
    await pool.query("SELECT * FROM bookings WHERE slot_id=$1 LIMIT 1", [slot])
  ).rows[0];
  await assert.rejects(
    () => changeBooking(cid, b.id, { slot_id: slot2 }, uid),
    /kursi terakhir/,
  );
  assert.equal(
    (await pool.query("SELECT slot_id FROM bookings WHERE id=$1", [b.id]))
      .rows[0].slot_id,
    slot,
  );
  await Promise.all([
    changeBooking(cid, b.id, { status: "cancelled" }, uid),
    changeBooking(cid, b.id, { status: "cancelled" }, uid),
  ]);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM bookings WHERE slot_id=$1 AND status<>'cancelled'",
        [slot],
      )
    ).rows[0].n,
    9,
  );
});
test("closed company/campaign rejects stale browser form", async () => {
  await pool.query("UPDATE companies SET status='inactive' WHERE id=$1", [cid]);
  await assert.rejects(
    () => createBooking(cid, campaign, body(500)),
    /tidak aktif/,
  );
  await pool.query("UPDATE companies SET status='active' WHERE id=$1", [cid]);
  await pool.query("UPDATE campaigns SET status='closed' WHERE id=$1", [
    campaign,
  ]);
  await assert.rejects(
    () => createBooking(cid, campaign, body(501)),
    /ditutup/,
  );
  await pool.query("UPDATE campaigns SET status='published' WHERE id=$1", [
    campaign,
  ]);
});
test("quota cannot be reduced below allocated seats", async () => {
  const s = (
    await pool.query("SELECT * FROM interview_slots WHERE id=$1", [slot])
  ).rows[0];
  const r = await req(`companies/${cid}/slots/${slot}`, "POST", {
    ...s,
    starts_at: s.starts_at.toISOString(),
    ends_at: s.ends_at.toISOString(),
    capacity: 1,
  });
  assert.equal(r.status, 409);
});
test("form version changes preserve answer labels", async () => {
  const p = (
    await pool.query("SELECT * FROM campaigns WHERE id=$1", [campaign])
  ).rows[0];
  const r = await req(`companies/${cid}/campaigns/${campaign}`, "POST", {
    ...p,
    fields: [
      {
        id: "question",
        label: "Pertanyaan baru",
        type: "text",
        required: true,
        options: [],
      },
    ],
  });
  assert.equal(r.status, 200);
  const b = (
    await pool.query(
      "SELECT answers,form_version FROM bookings WHERE campaign_id=$1 LIMIT 1",
      [campaign],
    )
  ).rows[0];
  assert.equal(b.form_version, 1);
  assert.equal(b.answers[0].label, "Pertanyaan lama");
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM form_versions WHERE campaign_id=$1",
        [campaign],
      )
    ).rows[0].n,
    2,
  );
});
test("custom role permissions applied; cannot escalate; last owner protected", async () => {
  const r = await req(`companies/${cid}/roles`, "POST", {
    name: "Limited",
    permissions: ["roles.create", "slots.read"],
  });
  assert.equal(r.status, 200);
  const role = await r.json();
  await pool.query(
    "UPDATE company_memberships SET role_id=$1 WHERE user_id=$2 AND company_id=$3",
    [role.id, viewer, cid],
  );
  assert.equal(
    (
      await req(
        `companies/${cid}/roles`,
        "POST",
        { name: "Escalated", permissions: ["members.invite"] },
        viewSession,
      )
    ).status,
    403,
  );
  assert.equal(
    (await req(`companies/${cid}/bookings`, "GET", undefined, viewSession))
      .status,
    403,
  );
  const m = (
    await pool.query(
      "SELECT * FROM company_memberships WHERE company_id=$1 AND user_id=$2",
      [cid, uid],
    )
  ).rows[0];
  assert.equal(
    (
      await req(`companies/${cid}/members/${m.id}`, "POST", {
        name: "Owner",
        email: "owner@example.test",
        role_id: m.role_id,
        active: false,
      })
    ).status,
    409,
  );
});
test("WhatsApp URL validation, active settings, token privacy", async () => {
  assert.equal(
    success.safeParse({ mode: "direct", url: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(
    success.safeParse({ mode: "direct", url: "https://wa.me.evil.test/" })
      .success,
    false,
  );
  const s = success.parse({
    phone: "081234567890",
    template: "Halo {nama} & {kode_booking}",
  });
  assert.ok(
    whatsapp(s, { nama: "A & B", kode_booking: "AA-X" }).url.includes("%26"),
  );
  await req(`companies/${cid}/settings`, "POST", s);
  const b = (
    await pool.query(
      "SELECT token FROM bookings WHERE campaign_id=$1 LIMIT 1",
      [campaign],
    )
  ).rows[0];
  const response = await req("success/" + b.token);
  assert.equal(response.status, 200);
  assert.ok(
    (await response.json()).whatsapp.url.startsWith("https://wa.me/628"),
  );
  const c = (await pool.query("SELECT slug FROM companies WHERE id=$1", [cid]))
    .rows[0];
  const pub = await (await req(`public/${c.slug}/test`)).json();
  assert.equal(JSON.stringify(pub).includes("person-"), false);
});
test("contrast and unsafe origin rejected", async () => {
  assert.equal(branding.safeParse({ primary: "#ffffff" }).success, false);
  const r = await handle(
    new Request("http://localhost:3210/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.test" },
      body: "{}",
    }),
    ["auth", "login"],
  );
  assert.equal(r.status, 403);
});
test(
  "concurrent campaign updates do not exhaust connection pool",
  { timeout: 10000 },
  async () => {
    const p = (
      await pool.query("SELECT * FROM campaigns WHERE id=$1", [campaign])
    ).rows[0];
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        req(`companies/${cid}/campaigns/${campaign}`, "POST", p),
      ),
    );
    assert.ok(responses.every((r) => r.status === 200));
  },
);

test("local campaign creation stays allowed after public deployment, but foreign origins do not", async () => {
  const request = (origin: string, host: string, slug: string) => handle(
    new Request(`http://${host}/api/companies/${cid}/campaigns`, {
      method: "POST",
      headers: { origin, host, cookie: "aa_session=" + session, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Local origin test", slug }),
    }),
    ["companies", cid, "campaigns"],
  );
  assert.equal((await request("http://localhost:3210", "localhost:3210", "local-host")).status, 200);
  assert.equal((await request("http://127.0.0.1:3210", "127.0.0.1:3210", "local-ip")).status, 200);
  for (const [origin, host] of [
    ["https://evil.test", "localhost:3210"],
    ["http://localhost:3210.evil.test", "localhost:3210"],
    ["http://localhost:3000", "localhost:3210"],
    ["http://localhost:3210", "calendar.dbautoaudit.stream"],
    ["null", "localhost:3210"],
  ]) assert.equal((await request(origin, host, "rejected")).status, 403);
});
