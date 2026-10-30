import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { pool, fail, type DB } from "./db";
export const token = () => randomBytes(32).toString("hex");
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function passwordHash(p: string) {
  const salt = token();
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}
export function verifyPassword(p: string, h: string | null) {
  if (!h) {
    scryptSync(p, "invalid", 64);
    return false;
  }
  const [s, v] = h.split(":");
  return timingSafeEqual(scryptSync(p, s, 64), Buffer.from(v, "hex"));
}
export async function currentUser(req: Request) {
  const value = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)aa_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!value) return null;
  return (
    (
      await pool.query(
        "SELECT u.id,u.name,u.email,u.super_admin,s.acting_company_id AS impersonating_company_id,CASE WHEN s.acting_user_id IS NOT NULL THEN s.user_id END AS impersonator_id FROM sessions s JOIN users original ON original.id=s.user_id JOIN users u ON u.id=coalesce(s.acting_user_id,s.user_id) LEFT JOIN companies c ON c.id=s.acting_company_id WHERE s.token_hash=$1 AND s.expires_at>now() AND original.active AND u.active AND u.registration_status='approved' AND (s.acting_user_id IS NULL OR (original.super_admin AND c.status='active' AND EXISTS(SELECT 1 FROM company_memberships m WHERE m.company_id=c.id AND m.user_id=u.id AND m.active)))",
        [hash(value)],
      )
    ).rows[0] ?? null
  );
}
export async function requireUser(req: Request) {
  return (
    (await currentUser(req)) ?? fail(401, "Please sign in first.")
  );
}
export async function access(
  db: DB,
  user: any,
  cid: string,
  permission?: string,
) {
  if (user.impersonating_company_id && user.impersonating_company_id !== cid)
    fail(403, "This session is limited to the selected company.");
  const c = (await db.query("SELECT id FROM companies WHERE id=$1", [cid]))
    .rows[0];
  if (!c) fail(404, "Company not found");
  if (user.super_admin) return { owner: true, permissions: [] };
  const m = (
    await db.query(
      "SELECT r.owner,r.permissions FROM company_memberships m JOIN roles r ON r.id=m.role_id WHERE m.company_id=$1 AND m.user_id=$2 AND m.active",
      [cid, user.id],
    )
  ).rows[0];
  if (!m || (permission && !m.owner && !m.permissions.includes(permission)))
    fail(403, "You do not have permission to perform this action.");
  return m;
}
// ponytail: global limits suit this local instance; use trusted-proxy IP limits before high-volume public traffic.
export async function rateLimit(key: string, limit: number) {
  const r = await pool.query(
    `INSERT INTO rate_limits(key,hits,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.hits+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING hits`,
    [hash(key)],
  );
  if (r.rows[0].hits > limit)
    fail(429, "Too many attempts. Try again in 15 minutes.");
}
export const sessionCookie = (v: string, age = 86400) =>
  `aa_session=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
export async function invite(db: DB, userId: string) {
  const t = token();
  await db.query("DELETE FROM access_tokens WHERE user_id=$1", [userId]);
  await db.query(
    "INSERT INTO access_tokens VALUES($1,$2,now()+interval '24 hours',NULL)",
    [hash(t), userId],
  );
  return `${process.env.APP_URL}/activate#${t}`;
}
