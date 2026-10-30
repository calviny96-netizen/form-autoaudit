import { randomUUID } from "node:crypto";
import { type DB } from "./db";
import { permissions } from "./schema";

export async function createCompany(db: DB, data: { name: string; slug?: string; contact?: string; timezone?: string; status?: string }, ownerId?: string) {
  const base = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "company";
  const company = (await db.query(
    "INSERT INTO companies(name,slug,contact,timezone,status,registered_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
    [data.name, data.slug || `${base}-${randomUUID().slice(0, 8)}`, data.contact || "", data.timezone || "Asia/Jakarta", data.status || "active", ownerId || null],
  )).rows[0];
  for (const [name, owner, perms] of [
    ["Company Owner", true, permissions],
    ["Company Admin", false, permissions.filter(p => !p.startsWith("members.") && !p.startsWith("roles."))],
    ["Booking Manager", false, permissions.filter(p => p.startsWith("slots.") || p.startsWith("bookings.") || p.startsWith("responses.") || p === "campaigns.read" || p === "forms.read")],
    ["Viewer", false, permissions.filter(p => p.endsWith(".read"))],
  ] as const) {
    const role = (await db.query("INSERT INTO roles(company_id,name,owner,permissions) VALUES($1,$2,$3,$4) RETURNING id", [company.id, name, owner, perms])).rows[0];
    if (owner && ownerId) await db.query("INSERT INTO company_memberships(company_id,user_id,role_id) VALUES($1,$2,$3)", [company.id, ownerId, role.id]);
  }
  return company;
}
