import type { DB } from "./db";
export function slugFromTitle(title: string) {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70).replace(/-$/, "") || "calendar";
}
// Call while holding the company row lock so simultaneous creations cannot collide.
export async function availableSlug(db: DB, table: "campaigns" | "forms", cid: string, title: string) {
  const base = slugFromTitle(title);
  const existing = new Set((await db.query(`SELECT slug FROM ${table} WHERE company_id=$1`, [cid])).rows.map(r => r.slug));
  let result = base;
  for (let n = 2; existing.has(result); n++) result = `${base}-${n}`;
  return result;
}
