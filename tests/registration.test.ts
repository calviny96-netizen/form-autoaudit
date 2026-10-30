import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { handle } from "../lib/api";
import { pool } from "../lib/db";
import { hash, passwordHash, token, verifyPassword } from "../lib/auth";
import { registrationSchema } from "../lib/schema";
let adminId: string, adminToken: string;
const emails: string[] = [];
const suffix = randomUUID();
const input = (i: number) => {
  const email = `registration-${suffix}-${i}@example.test`;
  emails.push(email);
  return { name: "Calendar test company", email, phone: `+62 899 ${String(Date.now()).slice(-9)}${i}`, password: "aaaaaaaa", confirm_password: "aaaaaaaa" };
};
async function request(path: string, data?: any, cookie = "") {
  return handle(new Request(process.env.APP_URL + "/api/" + path, { method: data ? "POST" : "GET", headers: { "Content-Type": "application/json", origin: new URL(process.env.APP_URL!).origin, cookie: "aa_session=" + cookie }, body: data ? JSON.stringify(data) : undefined }), path.split("/"));
}
before(async () => {
  const email = `registration-admin-${suffix}@example.test`; emails.push(email);
  adminId = (await pool.query("INSERT INTO users(name,email,super_admin,password_hash) VALUES('Registration Admin',$1,true,$2) RETURNING id", [email, passwordHash("aaaaaaaa")])).rows[0].id;
  adminToken = token();
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [hash(adminToken), adminId]);
});
after(async () => {
  const users = (await pool.query("SELECT id FROM users WHERE email=ANY($1)", [emails])).rows.map(r => r.id);
  const companies = (await pool.query("SELECT id FROM companies WHERE registered_by=ANY($1)", [users])).rows.map(r => r.id);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1) OR acting_company_id=ANY($2)", [users, companies]);
  await pool.query("DELETE FROM access_tokens WHERE user_id=ANY($1)", [users]);
  await pool.query("DELETE FROM audit_logs WHERE actor_id=ANY($1) OR company_id=ANY($2)", [users, companies]);
  await pool.query("DELETE FROM company_memberships WHERE company_id=ANY($1)", [companies]);
  await pool.query("DELETE FROM roles WHERE company_id=ANY($1)", [companies]);
  await pool.query("DELETE FROM companies WHERE id=ANY($1)", [companies]);
  await pool.query("DELETE FROM users WHERE id=ANY($1)", [users]);
  await pool.end();
});
test("registration accepts simple 8-character passwords and validates confirmation", () => {
  const b = input(0);
  assert.ok(registrationSchema.safeParse(b).success);
  assert.ok(!registrationSchema.safeParse({ ...b, password: "aaaaaaa", confirm_password: "aaaaaaa" }).success);
  assert.ok(!registrationSchema.safeParse({ ...b, confirm_password: "bbbbbbbb" }).success);
  assert.equal(registrationSchema.parse({ ...b, phone: "0812 3456 7890" }).phone, "6281234567890");
});
test("registration, pending approval, duplicate email/phone, scoped login-as, and direct reset", async () => {
  const b = input(1);
  assert.equal((await request("auth/register", b)).status, 201);
  const c = (await pool.query("SELECT c.*,u.phone FROM companies c JOIN users u ON u.id=c.registered_by WHERE u.email=$1", [b.email])).rows[0];
  assert.equal(c.status, "pending");
  assert.equal((await request("auth/login", { email: b.email, password: b.password })).status, 403);
  const duplicate = input(2);
  assert.equal((await request("auth/register", { ...duplicate, email: b.email.toUpperCase() })).status, 409);
  assert.equal((await request("auth/register", { ...duplicate, phone: "0" + c.phone.slice(2) })).status, 409);
  assert.equal((await request(`platform/companies/${c.id}/review`, { action: "approve" })).status, 401);
  assert.equal((await request(`platform/companies/${c.id}/login-as`, {}, adminToken)).status, 409);
  assert.equal((await request(`platform/companies/${c.id}/review`, { action: "approve" }, adminToken)).status, 200);
  assert.equal((await request(`platform/companies/${c.id}/review`, { action: "reject" }, adminToken)).status, 409);
  const login = await request("auth/login", { email: b.email, password: b.password });
  assert.equal(login.status, 200);
  const ownerToken = login.headers.get("set-cookie")!.match(/aa_session=([a-f0-9]{64})/)![1];
  assert.equal((await request("platform/pending-companies", undefined, ownerToken)).status, 403);
  assert.equal((await request(`platform/companies/${c.id}/login-as`, {}, adminToken)).status, 200);
  const me = await (await request("auth/me", undefined, adminToken)).json();
  assert.equal(me.user.super_admin, false);
  assert.equal(me.user.impersonator_id, adminId);
  assert.deepEqual(me.companies.map((r: any) => r.id), [c.id]);
  assert.equal((await request("platform/users", undefined, adminToken)).status, 403);
  assert.equal((await request(`companies/${randomUUID()}/campaigns`, undefined, adminToken)).status, 403);
  assert.equal((await request(`companies/${c.id}/campaigns`, undefined, adminToken)).status, 200);
  assert.equal((await request("auth/stop-impersonation", {}, adminToken)).status, 200);
  assert.equal((await (await request("auth/me", undefined, adminToken)).json()).user.super_admin, true);
  assert.equal((await request("platform/user/" + c.registered_by, { action: "reset", password: "bbbbbbbb", confirm_password: "cccccccc" }, adminToken)).status, 400);
  assert.equal((await request("platform/user/" + c.registered_by, { action: "reset", password: "bbbbbbbb", confirm_password: "bbbbbbbb" }, adminToken)).status, 200);
  assert.equal((await (await request("auth/me", undefined, ownerToken)).json()).user, null);
  assert.equal((await request("auth/login", { email: b.email, password: b.password })).status, 401);
  assert.equal((await request("auth/login", { email: b.email, password: "bbbbbbbb" })).status, 200);
  const stored = (await pool.query("SELECT password_hash FROM users WHERE id=$1", [c.registered_by])).rows[0];
  assert.notEqual(stored.password_hash, "bbbbbbbb"); assert.ok(verifyPassword("bbbbbbbb", stored.password_hash));
});
test("rejection prevents login and concurrent registrations cannot duplicate contact details", async () => {
  const b = input(3);
  const results = await Promise.all([request("auth/register", b), request("auth/register", b)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const c = (await pool.query("SELECT c.id FROM companies c JOIN users u ON u.id=c.registered_by WHERE u.email=$1", [b.email])).rows[0];
  assert.equal((await request(`platform/companies/${c.id}/review`, { action: "reject", reason: "Test rejection" }, adminToken)).status, 200);
  assert.equal((await request("auth/login", { email: b.email, password: b.password })).status, 403);
  const company = (await pool.query("SELECT * FROM companies WHERE id=$1", [c.id])).rows[0];
  assert.equal(company.status, "rejected"); assert.equal(company.reviewed_by, adminId); assert.equal(company.rejection_reason, "Test rejection");
});
test("admin creates an approved owner account without owning a calendar", async () => {
  const b = input(4);
  const result = await request("platform/companies", b, adminToken);
  assert.equal(result.status, 200);
  const c = await result.json();
  assert.equal(c.status, "active");
  assert.equal((await pool.query("SELECT 1 FROM company_memberships WHERE company_id=$1 AND user_id=$2", [c.id, adminId])).rowCount, 0);
  assert.equal((await request("auth/login", { email: b.email, password: b.password })).status, 200);
});

test("Super Admin can set up an owner for an existing company", async () => {
  const b = input(5);
  const c = (await pool.query("INSERT INTO companies(name,slug) VALUES('Legacy company',$1) RETURNING id", ["legacy-" + suffix])).rows[0];
  const role = (await pool.query("INSERT INTO roles(company_id,name,owner) VALUES($1,'Company Owner',true) RETURNING id", [c.id])).rows[0];
  // Register this company for cleanup even if owner setup fails.
  await pool.query("UPDATE companies SET registered_by=$1 WHERE id=$2", [adminId, c.id]);
  assert.equal((await request(`platform/companies/${c.id}/owner`, b, adminToken)).status, 200);
  assert.equal((await request(`platform/companies/${c.id}/owner`, input(6), adminToken)).status, 409);
  assert.equal((await request(`platform/companies/${c.id}/login-as`, {}, adminToken)).status, 200);
  const me = await (await request("auth/me", undefined, adminToken)).json();
  assert.equal(me.user.super_admin, false); assert.equal(me.user.impersonating_company_id, c.id);
  assert.equal((await request("auth/stop-impersonation", {}, adminToken)).status, 200);
});
test("only Super Admin sets a company footer watermark, and company branding keeps it", async () => {
  const b = input(9);
  const c = await (await request("platform/companies", b, adminToken)).json();
  const login = await request("auth/login", { email: b.email, password: b.password });
  const ownerToken = login.headers.get("set-cookie")!.match(/aa_session=([a-f0-9]{64})/)![1];
  const custom = { mode: "custom", text: "Powered by Test Co", image_width: 60, text_size: 14 };
  assert.equal((await request(`platform/companies/${c.id}/footer`, custom, ownerToken)).status, 403);
  assert.equal((await request(`platform/companies/${c.id}/footer`, { mode: "custom", image: "https://evil.test/x.png" }, adminToken)).status, 400);
  assert.equal((await request(`platform/companies/${c.id}/footer`, { mode: "custom", image_width: 5000 }, adminToken)).status, 400);
  assert.equal((await request(`platform/companies/${c.id}/footer`, custom, adminToken)).status, 200);
  // A company saving its own branding cannot overwrite or forge the footer.
  assert.equal((await request(`companies/${c.id}/branding`, { primary: "#075985", footer: { mode: "hidden" } }, ownerToken)).status, 200);
  const stored = (await pool.query("SELECT branding FROM companies WHERE id=$1", [c.id])).rows[0].branding;
  assert.equal(stored.primary, "#075985");
  assert.deepEqual(stored.footer, { mode: "custom", text: "Powered by Test Co", image: "", image_width: 60, text_size: 14 });
  assert.equal((await request(`platform/companies/${c.id}/footer`, { mode: "hidden" }, adminToken)).status, 200);
  assert.equal((await pool.query("SELECT branding FROM companies WHERE id=$1", [c.id])).rows[0].branding.footer.mode, "hidden");
});
test("concurrent registrations with different emails cannot reuse a phone number", async () => {
  const a = input(7), b = { ...input(8), phone: a.phone };
  const results = await Promise.all([request("auth/register", a), request("auth/register", b)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
});
