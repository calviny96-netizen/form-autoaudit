import { NextResponse } from "next/server";
import { z } from "zod";
import { pool, transaction, fail, audit, HttpError, type DB } from "./db";
import {
  currentUser,
  requireUser,
  access,
  rateLimit,
  hash,
  token,
  passwordHash,
  verifyPassword,
  sessionCookie,
  invite,
} from "./auth";
import {
  permissions,
  uuid,
  email,
  companySchema,
  campaignSchema,
  slotSchema,
  branding,
  success,
  whatsapp,
} from "./schema";
import { createBooking, changeBooking } from "./booking";
import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
const json = (x: unknown, status = 200) =>
  NextResponse.json(x, { status, headers: { "Cache-Control": "no-store" } });
async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 200000) fail(413, "Permintaan terlalu besar");
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, "Format permintaan tidak valid");
  }
}
async function findCampaign(cid: string, id: string, db: DB = pool) {
  return (
    (
      await db.query("SELECT * FROM campaigns WHERE company_id=$1 AND id=$2", [
        cid,
        id,
      ])
    ).rows[0] ?? fail(404, "Gelombang tidak ditemukan")
  );
}
export async function handle(req: Request, parts: string[]) {
  try {
    const method = req.method;
    const route = parts.join("/");
    const url = new URL(req.url);
    if (!["GET", "HEAD"].includes(method)) {
      const origin = req.headers.get("origin");
      const localOrigin =
        (origin === "http://localhost:3210" || origin === "http://127.0.0.1:3210") &&
        req.headers.get("host") === new URL(origin).host;
      if (origin && origin !== new URL(process.env.APP_URL!).origin && !localOrigin)
        fail(403, "Asal permintaan tidak diizinkan");
    }
    if (route === "health/live") return json({ status: "ok" });
    if (route === "health/ready") {
      await pool.query("SELECT 1");
      return json({ status: "ready" });
    }
    if (route === "platform-brand" && method === "GET") {
      const s = (await pool.query("SELECT settings FROM platform_settings")).rows[0].settings;
      return json({ name: s.name || "Auto Audit", support_email: s.support_email || "" });
    }
    if (route === "auth/me") {
      const user = await currentUser(req);
      if (!user) return json({ user: null });
      const companies = user.super_admin
        ? (
            await pool.query(
              "SELECT id,name,slug,status FROM companies ORDER BY name",
            )
          ).rows
        : (
            await pool.query(
              "SELECT c.id,c.name,c.slug,c.status FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE m.user_id=$1 AND m.active ORDER BY c.name",
              [user.id],
            )
          ).rows;
      return json({ user, companies });
    }
    if (route === "auth/login" && method === "POST") {
      const b = z
        .object({ email, password: z.string().min(1).max(256) })
        .parse(await body(req));
      await rateLimit("login:global", 300);
      await rateLimit("login:" + b.email, 15);
      const u = (
        await pool.query("SELECT * FROM users WHERE email=$1", [b.email])
      ).rows[0];
      if (!verifyPassword(b.password, u?.password_hash ?? null) || !u?.active)
        fail(401, "Email atau password salah");
      const t = token();
      await pool.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')",
        [hash(t), u.id],
      );
      await audit(pool, u.id, null, "auth.login");
      return new NextResponse(JSON.stringify({ ok: true }), {
        headers: {
          "Set-Cookie": sessionCookie(t),
          "Content-Type": "application/json",
        },
      });
    }
    if (route === "auth/logout" && method === "POST") {
      const t = req.headers
        .get("cookie")
        ?.match(/aa_session=([a-f0-9]{64})/)?.[1];
      if (t)
        await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hash(t)]);
      return new NextResponse("{}", {
        headers: { "Set-Cookie": sessionCookie("", 0) },
      });
    }
    if (route === "auth/activate" && method === "POST") {
      await rateLimit("activate:global", 100);
      const b = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: z.string().min(12, "Password minimal 12 karakter").max(128),
        })
        .parse(await body(req));
      await transaction(async (db) => {
        const t = (
          await db.query(
            "SELECT * FROM access_tokens WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE",
            [hash(b.token)],
          )
        ).rows[0];
        if (!t) fail(400, "Tautan tidak valid atau kedaluwarsa");
        await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          passwordHash(b.password),
          t.user_id,
        ]);
        await db.query(
          "UPDATE access_tokens SET used_at=now() WHERE token_hash=$1",
          [hash(b.token)],
        );
        await db.query("DELETE FROM sessions WHERE user_id=$1", [t.user_id]);
        await audit(db, t.user_id, null, "access.activated");
      });
      return json({ ok: true });
    }
    if (parts[0] === "assets" && method === "GET") {
      const name = z
        .string()
        .regex(/^[a-f0-9]{64}\.webp$/)
        .parse(parts[1]);
      if (
        !(
          await pool.query("SELECT 1 FROM uploaded_assets WHERE filename=$1", [
            name,
          ])
        ).rowCount
      )
        fail(404, "Aset tidak ditemukan");
      return new NextResponse(
        await readFile(path.join(process.env.UPLOAD_DIR!, name)),
        {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=86400",
          },
        },
      );
    }
    if (parts[0] === "public" && parts.length === 3) {
      const c = (
        await pool.query("SELECT * FROM companies WHERE slug=$1", [parts[1]])
      ).rows[0];
      if (!c) fail(404, "Link tidak ditemukan");
      const p = (
        await pool.query(
          "SELECT * FROM campaigns WHERE company_id=$1 AND slug=$2 AND status<>'draft' AND status<>'archived'",
          [c.id, parts[2]],
        )
      ).rows[0];
      if (!p) fail(404, "Link tidak ditemukan");
      if (method === "POST") {
        await rateLimit("booking:global", 3000);
        return json(await createBooking(c.id, p.id, await body(req)));
      }
      if (c.status !== "active")
        fail(409, "Company tidak aktif. Pendaftaran sementara tidak tersedia.");
      const slots = (
        await pool.query(
          "SELECT s.*,s.capacity-count(b.id)::int AS remaining FROM interview_slots s LEFT JOIN bookings b ON b.slot_id=s.id AND b.status<>'cancelled' WHERE s.campaign_id=$1 AND s.starts_at>now() GROUP BY s.id ORDER BY s.starts_at",
          [p.id],
        )
      ).rows;
      return json({
        company: { name: c.name, slug: c.slug, branding: c.branding },
        campaign: p,
        slots,
      });
    }
    if (parts[0] === "success" && method === "GET") {
      await rateLimit("token:global", 1000);
      const t = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(parts[1]);
      const b = (
        await pool.query(
          "SELECT b.name,b.code,b.status,b.created_at,c.name AS company,c.success AS company_success,c.branding,p.title,p.success,p.timezone,s.starts_at,s.ends_at FROM bookings b JOIN companies c ON c.id=b.company_id JOIN campaigns p ON p.id=b.campaign_id JOIN interview_slots s ON s.id=b.slot_id WHERE b.token=$1",
          [t],
        )
      ).rows[0];
      if (!b) fail(404, "Booking tidak ditemukan");
      const config = success.parse(b.success ?? b.company_success);
      const date = new Date(b.starts_at);
      return json({
        ...b,
        config,
        whatsapp: whatsapp(config, {
          nama: b.name,
          kode_booking: b.code,
          company: b.company,
          gelombang: b.title,
          tanggal: date.toLocaleDateString("id-ID", {
            timeZone: b.timezone,
            dateStyle: "long",
          }),
          jam: date.toLocaleTimeString("id-ID", {
            timeZone: b.timezone,
            hour: "2-digit",
            minute: "2-digit",
          }),
          zona_waktu: b.timezone,
        }),
      });
    }
    const user = await requireUser(req);
    if (parts[0] === "platform") {
      if (!user.super_admin) fail(403, "Khusus Super Admin");
      if (parts[1] === "overview")
        return json(
          (
            await pool.query(
              "SELECT (SELECT count(*) FROM companies WHERE status='active') AS companies,(SELECT count(*) FROM campaigns WHERE status='published') AS campaigns,(SELECT count(*) FROM bookings WHERE status<>'cancelled') AS bookings,(SELECT count(*) FROM interview_slots) AS slots",
            )
          ).rows[0],
        );
      if (parts[1] === "audit")
        return json(
          (
            await pool.query(
              "SELECT a.*,u.name AS actor,c.name AS company FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN companies c ON c.id=a.company_id ORDER BY a.id DESC LIMIT 200",
            )
          ).rows,
        );
      if (parts[1] === "settings") {
        if (method === "GET")
          return json(
            (await pool.query("SELECT settings FROM platform_settings")).rows[0]
              .settings,
          );
        const b = z
          .object({
            name: z.string().min(1).max(150),
            support_email: z.union([z.literal(""), email]),
            email_note: z.string().max(1000).default(""),
            upload_max_mb: z.number().min(0.1).max(2).default(2),
          })
          .parse(await body(req));
        await pool.query("UPDATE platform_settings SET settings=$1", [
          JSON.stringify(b),
        ]);
        await audit(pool, user.id, null, "platform.settings");
        return json(b);
      }
      if (parts[1] === "users") {
        if (method === "GET")
          return json(
            (
              await pool.query(
                "SELECT id,name,email,active,super_admin FROM users ORDER BY created_at DESC",
              )
            ).rows,
          );
        const b = z
          .object({ name: z.string().min(2).max(150), email })
          .parse(await body(req));
        return json(
          await transaction(async (db) => {
            const u = (
              await db.query(
                "INSERT INTO users(name,email,super_admin) VALUES($1,$2,true) RETURNING id",
                [b.name, b.email],
              )
            ).rows[0];
            const link = await invite(db, u.id);
            await audit(db, user.id, null, "platform.user.invited", u.id);
            return { link };
          }),
        );
      }
      if (parts[1] === "user" && parts[2]) {
        const uid = uuid.parse(parts[2]);
        const b = z
          .object({ action: z.enum(["reset", "disable", "enable"]) })
          .parse(await body(req));
        if (b.action === "reset")
          return json(
            await transaction(async (db) => {
              const u = (
                await db.query("SELECT id FROM users WHERE id=$1", [uid])
              ).rows[0];
              if (!u) fail(404, "Pengguna tidak ditemukan");
              await db.query("DELETE FROM sessions WHERE user_id=$1", [uid]);
              await audit(db, user.id, null, "access.reset", uid);
              return { link: await invite(db, uid) };
            }),
          );
        await transaction(async (db) => {
          await db.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
          if (b.action === "disable") {
            if (uid === user.id)
              fail(400, "Tidak dapat menonaktifkan diri sendiri");
            if (
              (
                await db.query(
                  "SELECT 1 FROM company_memberships m JOIN roles r ON r.id=m.role_id WHERE m.user_id=$1 AND m.active AND r.owner",
                  [uid],
                )
              ).rowCount
            )
              fail(
                409,
                "Pindahkan kepemilikan company sebelum menonaktifkan Owner",
              );
          }
          await db.query("UPDATE users SET active=$1 WHERE id=$2", [
            b.action === "enable",
            uid,
          ]);
          await db.query("DELETE FROM sessions WHERE user_id=$1", [uid]);
          await audit(db, user.id, null, "user." + b.action, uid);
        });
        return json({ ok: true });
      }
      if (parts[1] === "companies") {
        if (method === "GET")
          return json(
            (
              await pool.query(
                "SELECT c.*,(SELECT count(*) FROM campaigns p WHERE p.company_id=c.id) AS campaigns,(SELECT count(*) FROM bookings b WHERE b.company_id=c.id AND b.status<>'cancelled') AS bookings,(SELECT count(*) FROM interview_slots s WHERE s.company_id=c.id) AS slots,(SELECT coalesce(sum(capacity),0) FROM interview_slots s WHERE s.company_id=c.id) AS capacity FROM companies c ORDER BY c.created_at DESC",
              )
            ).rows,
          );
        const b = companySchema.parse(await body(req));
        return json(
          await transaction(async (db) => {
            if (parts[2]) {
              const cid = uuid.parse(parts[2]);
              const r = (
                await db.query(
                  "UPDATE companies SET name=$1,slug=$2,contact=$3,timezone=$4,status=$5 WHERE id=$6 RETURNING *",
                  [b.name, b.slug, b.contact, b.timezone, b.status, cid],
                )
              ).rows[0];
              if (!r) fail(404, "Company tidak ditemukan");
              await audit(db, user.id, cid, "company.updated", cid);
              return r;
            }
            const c = (
              await db.query(
                "INSERT INTO companies(name,slug,contact,timezone,status) VALUES($1,$2,$3,$4,$5) RETURNING *",
                [b.name, b.slug, b.contact, b.timezone, b.status],
              )
            ).rows[0];
            for (const [name, owner, perms] of [
              ["Company Owner", true, permissions],
              [
                "Company Admin",
                false,
                permissions.filter(
                  (p) => !p.startsWith("members.") && !p.startsWith("roles."),
                ),
              ],
              [
                "Recruiter",
                false,
                permissions.filter(
                  (p) =>
                    p.startsWith("slots.") ||
                    p.startsWith("bookings.") ||
                    p === "campaigns.read",
                ),
              ],
              ["Viewer", false, permissions.filter((p) => p.endsWith(".read"))],
            ] as const)
              await db.query(
                "INSERT INTO roles(company_id,name,owner,permissions) VALUES($1,$2,$3,$4)",
                [c.id, name, owner, perms],
              );
            const owner = (
              await db.query(
                "SELECT id FROM roles WHERE company_id=$1 AND owner",
                [c.id],
              )
            ).rows[0];
            await db.query(
              "INSERT INTO company_memberships(company_id,user_id,role_id) VALUES($1,$2,$3)",
              [c.id, user.id, owner.id],
            );
            await audit(db, user.id, c.id, "company.created", c.id);
            return c;
          }),
        );
      }
    }
    if (parts[0] === "companies" && parts[1]) {
      const cid = uuid.parse(parts[1]);
      const module = parts[2];
      const id = parts[3] ? uuid.parse(parts[3]) : undefined;
      const membership = await access(pool, user, cid);
      if (!module) {
        const c = (
          await pool.query("SELECT * FROM companies WHERE id=$1", [cid])
        ).rows[0];
        return json({
          ...c,
          permissions:
            user.super_admin || membership.owner
              ? permissions
              : membership.permissions,
          owner: user.super_admin || membership.owner,
        });
      }
      if (module === "overview") {
        await access(pool, user, cid, "campaigns.read");
        return json(
          (
            await pool.query(
              "SELECT (SELECT count(*) FROM campaigns WHERE company_id=$1 AND status='published') AS campaigns,(SELECT count(*) FROM bookings WHERE company_id=$1 AND status<>'cancelled') AS bookings,(SELECT count(*) FROM interview_slots WHERE company_id=$1) AS slots,(SELECT coalesce(sum(capacity),0) FROM interview_slots WHERE company_id=$1) AS capacity",
              [cid],
            )
          ).rows[0],
        );
      }
      if (module === "audit") {
        await access(pool, user, cid, "audit.read");
        return json(
          (
            await pool.query(
              "SELECT a.*,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE company_id=$1 ORDER BY id DESC LIMIT 200",
              [cid],
            )
          ).rows,
        );
      }
      if (module === "branding" || module === "settings") {
        await access(
          pool,
          user,
          cid,
          `${module}.${method === "GET" ? "read" : "update"}`,
        );
        if (method === "GET")
          return json(
            (
              await pool.query(
                `SELECT ${module === "branding" ? "branding" : "success"} AS value FROM companies WHERE id=$1`,
                [cid],
              )
            ).rows[0].value,
          );
        const b =
          module === "branding"
            ? branding.parse(await body(req))
            : success.parse(await body(req));
        await pool.query(
          `UPDATE companies SET ${module === "branding" ? "branding=branding || $1::jsonb" : "success=$1"} WHERE id=$2`,
          [JSON.stringify(b), cid],
        );
        await audit(pool, user.id, cid, module + ".updated", cid);
        return json(b);
      }
      if (module === "logo" && method === "POST") {
        await access(pool, user, cid, "branding.update");
        const data = await req.formData();
        const file = data.get("file");
        if (!(file instanceof File)) fail(400, "Pilih file logo");
        const setting = (
          await pool.query("SELECT settings FROM platform_settings")
        ).rows[0].settings;
        const max = Math.min(setting.upload_max_mb ?? 2, 2) * 1024 * 1024;
        if (file.size > max) fail(400, `Logo maksimal ${max / 1024 / 1024} MB`);
        const buffer = Buffer.from(await file.arrayBuffer());
        let output;
        try {
          const img = sharp(buffer, { limitInputPixels: 16000000 });
          const meta = await img.metadata();
          if (!["png", "jpeg", "webp"].includes(meta.format ?? ""))
            fail(400, "Gunakan PNG, JPEG, atau WebP");
          output = await img
            .resize({
              width: 1000,
              height: 1000,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp()
            .toBuffer();
        } catch {
          fail(400, "Isi gambar tidak valid atau terlalu besar");
        }
        const filename = token() + ".webp";
        await mkdir(process.env.UPLOAD_DIR!, { recursive: true });
        await writeFile(path.join(process.env.UPLOAD_DIR!, filename), output, {
          mode: 0o600,
        });
        await pool.query(
          "INSERT INTO uploaded_assets(company_id,filename) VALUES($1,$2)",
          [cid, filename],
        );
        await pool.query(
          "UPDATE companies SET branding=jsonb_set(branding,'{logo}',$1::jsonb) WHERE id=$2",
          [JSON.stringify("/api/assets/" + filename), cid],
        );
        await audit(pool, user.id, cid, "branding.logo", cid);
        return json({ url: "/api/assets/" + filename });
      }
      if (module === "roles") {
        await access(
          pool,
          user,
          cid,
          `roles.${method === "GET" ? "read" : method === "DELETE" ? "delete" : id ? "update" : "create"}`,
        );
        if (method === "GET")
          return json(
            (
              await pool.query(
                "SELECT * FROM roles WHERE company_id=$1 ORDER BY owner DESC,name",
                [cid],
              )
            ).rows,
          );
        return json(
          await transaction(async (db) => {
            await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
              cid,
            ]);
            const old = id
              ? (
                  await db.query(
                    "SELECT * FROM roles WHERE company_id=$1 AND id=$2",
                    [cid, id],
                  )
                ).rows[0]
              : null;
            if (id && !old) fail(404, "Role tidak ditemukan");
            if (old?.owner) fail(403, "Role Owner tidak dapat diubah");
            if (method === "DELETE") {
              if (
                !user.super_admin &&
                !membership.owner &&
                old.permissions.some(
                  (p: string) => !membership.permissions.includes(p),
                )
              )
                fail(403, "Role di luar kewenangan");
              await db.query(
                "DELETE FROM roles WHERE company_id=$1 AND id=$2",
                [cid, id],
              );
              await audit(db, user.id, cid, "role.deleted", id);
              return { ok: true };
            }
            const b = z
              .object({
                name: z.string().trim().min(2).max(100),
                permissions: z.array(z.enum(permissions)),
              })
              .parse(await body(req));
            const m = await access(db, user, cid);
            if (
              !user.super_admin &&
              !m.owner &&
              b.permissions.some((p) => !m.permissions.includes(p))
            )
              fail(403, "Tidak boleh memberikan izin melebihi kewenangan Anda");
            if (
              old &&
              !m.owner &&
              !user.super_admin &&
              old.permissions.some((p: string) => !m.permissions.includes(p))
            )
              fail(403, "Role di luar kewenangan");
            const r = id
              ? (
                  await db.query(
                    "UPDATE roles SET name=$1,permissions=$2 WHERE company_id=$3 AND id=$4 RETURNING *",
                    [b.name, b.permissions, cid, id],
                  )
                ).rows[0]
              : (
                  await db.query(
                    "INSERT INTO roles(company_id,name,permissions) VALUES($1,$2,$3) RETURNING *",
                    [cid, b.name, b.permissions],
                  )
                ).rows[0];
            await audit(db, user.id, cid, "role.saved", r.id);
            return r;
          }),
        );
      }
      if (module === "members") {
        await access(
          pool,
          user,
          cid,
          `members.${method === "GET" ? "read" : id ? "update" : "invite"}`,
        );
        if (method === "GET")
          return json(
            (
              await pool.query(
                "SELECT m.*,u.email,u.name,r.name AS role_name,r.owner FROM company_memberships m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id WHERE m.company_id=$1 ORDER BY u.name",
                [cid],
              )
            ).rows,
          );
        return json(
          await transaction(async (db) => {
            await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
              cid,
            ]);
            const b = z
              .object({
                name: z.string().min(2).max(150),
                email,
                role_id: uuid,
                active: z.boolean().default(true),
                reset: z.boolean().default(false),
              })
              .parse(await body(req));
            const role = (
              await db.query(
                "SELECT * FROM roles WHERE company_id=$1 AND id=$2",
                [cid, b.role_id],
              )
            ).rows[0];
            if (!role) fail(400, "Role tidak valid");
            const m = await access(db, user, cid);
            if (
              !user.super_admin &&
              !m.owner &&
              (role.owner ||
                role.permissions.some(
                  (p: string) => !m.permissions.includes(p),
                ))
            )
              fail(403, "Role melebihi kewenangan Anda");
            let uid: string;
            if (id) {
              const old = (
                await db.query(
                  "SELECT m.*,r.owner,r.permissions FROM company_memberships m JOIN roles r ON r.id=m.role_id WHERE m.company_id=$1 AND m.id=$2",
                  [cid, id],
                )
              ).rows[0];
              if (!old) fail(404, "Anggota tidak ditemukan");
              if (
                !user.super_admin &&
                !m.owner &&
                (old.owner ||
                  old.permissions.some(
                    (p: string) => !m.permissions.includes(p),
                  ))
              )
                fail(403, "Anggota di luar kewenangan");
              if (!b.active) await access(db, user, cid, "members.remove");
              if (old.owner && old.active && (!role.owner || !b.active)) {
                const n = (
                  await db.query(
                    "SELECT count(*)::int AS n FROM company_memberships m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.active AND r.owner AND u.active",
                    [cid],
                  )
                ).rows[0].n;
                if (n <= 1)
                  fail(409, "Company harus memiliki minimal satu Owner aktif");
              }
              uid = old.user_id;
              await db.query(
                "UPDATE company_memberships SET role_id=$1,active=$2 WHERE id=$3",
                [role.id, b.active, id],
              );
            } else {
              let u = (
                await db.query("SELECT id FROM users WHERE email=$1", [b.email])
              ).rows[0];
              if (!u)
                u = (
                  await db.query(
                    "INSERT INTO users(email,name) VALUES($1,$2) RETURNING id",
                    [b.email, b.name],
                  )
                ).rows[0];
              uid = u.id;
              await db.query(
                "INSERT INTO company_memberships(company_id,user_id,role_id) VALUES($1,$2,$3)",
                [cid, uid, role.id],
              );
            }
            const u = (
              await db.query(
                "SELECT password_hash,super_admin FROM users WHERE id=$1",
                [uid],
              )
            ).rows[0];
            let link;
            if (!u.password_hash) link = await invite(db, uid);
            if (b.reset) {
              if (!user.super_admin)
                fail(
                  403,
                  "Reset akun lintas company hanya dapat dilakukan Super Admin",
                );
              await db.query("DELETE FROM sessions WHERE user_id=$1", [uid]);
              link = await invite(db, uid);
            }
            await audit(db, user.id, cid, "member.saved", id ?? uid);
            return { ok: true, link };
          }),
        );
      }
      if (module === "campaigns") {
        await access(
          pool,
          user,
          cid,
          `campaigns.${method === "GET" ? "read" : id ? "update" : "create"}`,
        );
        if (method === "GET") {
          if (id) return json(await findCampaign(cid, id));
          return json(
            (
              await pool.query(
                "SELECT p.*,(SELECT count(*) FROM interview_slots s WHERE s.campaign_id=p.id) AS slots,(SELECT count(*) FROM bookings b WHERE b.campaign_id=p.id AND b.status<>'cancelled') AS bookings FROM campaigns p WHERE company_id=$1 ORDER BY created_at DESC",
                [cid],
              )
            ).rows,
          );
        }
        const b = campaignSchema.parse(await body(req));
        return json(
          await transaction(async (db) => {
            await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
              cid,
            ]);
            const old = id ? await findCampaign(cid, id, db) : null;
            if (b.status === "published" || old?.status === "published")
              await access(db, user, cid, "campaigns.publish");
            if (b.status === "archived")
              await access(db, user, cid, "campaigns.archive");
            const changed =
              !old || JSON.stringify(old.fields) !== JSON.stringify(b.fields);
            const version = old ? old.form_version + (changed ? 1 : 0) : 1;
            const values = [
              b.title,
              b.slug,
              b.description,
              b.position,
              b.location,
              b.timezone,
              b.opens_at,
              b.closes_at,
              b.status,
              version,
              JSON.stringify(b.fields),
              b.success ? JSON.stringify(b.success) : null,
              cid,
            ];
            const p = id
              ? (
                  await db.query(
                    "UPDATE campaigns SET title=$1,slug=$2,description=$3,position=$4,location=$5,timezone=$6,opens_at=$7,closes_at=$8,status=$9,form_version=$10,fields=$11,success=$12 WHERE company_id=$13 AND id=$14 RETURNING *",
                    [...values, id],
                  )
                ).rows[0]
              : (
                  await db.query(
                    "INSERT INTO campaigns(title,slug,description,position,location,timezone,opens_at,closes_at,status,form_version,fields,success,company_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
                    values,
                  )
                ).rows[0];
            if (changed)
              await db.query(
                "INSERT INTO form_versions(company_id,campaign_id,version,fields) VALUES($1,$2,$3,$4)",
                [cid, p.id, version, JSON.stringify(b.fields)],
              );
            await audit(db, user.id, cid, "campaign.saved", p.id);
            return p;
          }),
        );
      }
      if (module === "slots") {
        await access(
          pool,
          user,
          cid,
          `slots.${method === "GET" ? "read" : id ? "update" : "create"}`,
        );
        if (method === "GET") {
          const campaign = uuid.parse(url.searchParams.get("campaign"));
          await findCampaign(cid, campaign);
          return json(
            (
              await pool.query(
                "SELECT s.*,count(b.id)::int AS booked,s.capacity-count(b.id)::int AS remaining FROM interview_slots s LEFT JOIN bookings b ON b.slot_id=s.id AND b.status<>'cancelled' WHERE s.company_id=$1 AND s.campaign_id=$2 GROUP BY s.id ORDER BY starts_at",
                [cid, campaign],
              )
            ).rows,
          );
        }
        const raw = await body(req);
        const campaign = uuid.parse(raw.campaign_id);
        const list = z
          .array(slotSchema)
          .min(1)
          .max(500)
          .parse(id ? [raw] : raw.slots);
        return json(
          await transaction(async (db) => {
            await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
              cid,
            ]);
            await findCampaign(cid, campaign, db);
            for (const s of list) {
              if (s.status === "cancelled")
                await access(db, user, cid, "slots.cancel");
              if (id) {
                const old = (
                  await db.query(
                    "SELECT * FROM interview_slots WHERE company_id=$1 AND campaign_id=$2 AND id=$3 FOR UPDATE",
                    [cid, campaign, id],
                  )
                ).rows[0];
                if (!old) fail(404, "Slot tidak ditemukan");
                const n = (
                  await db.query(
                    "SELECT count(*)::int AS n FROM bookings WHERE slot_id=$1 AND status<>'cancelled'",
                    [id],
                  )
                ).rows[0].n;
                if (s.capacity < n)
                  fail(409, "Kuota tidak boleh kurang dari booking aktif");
                if (
                  n &&
                  (new Date(s.starts_at).getTime() !==
                    new Date(old.starts_at).getTime() ||
                    new Date(s.ends_at).getTime() !==
                      new Date(old.ends_at).getTime())
                )
                  fail(
                    409,
                    "Pindahkan peserta sebelum mengubah waktu slot yang sudah terisi",
                  );
                await db.query(
                  "UPDATE interview_slots SET starts_at=$1,ends_at=$2,capacity=$3,status=$4,note=$5 WHERE id=$6",
                  [s.starts_at, s.ends_at, s.capacity, s.status, s.note, id],
                );
              } else
                await db.query(
                  "INSERT INTO interview_slots(company_id,campaign_id,starts_at,ends_at,capacity,status,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
                  [
                    cid,
                    campaign,
                    s.starts_at,
                    s.ends_at,
                    s.capacity,
                    s.status,
                    s.note,
                  ],
                );
            }
            await audit(db, user.id, cid, "slots.saved", campaign);
            return { ok: true };
          }),
        );
      }
      if (module === "bookings") {
        await access(
          pool,
          user,
          cid,
          `bookings.${method === "GET" ? (url.searchParams.get("export") ? "export" : "read") : "update"}`,
        );
        if (method === "GET") {
          const search = (url.searchParams.get("q") ?? "").slice(0, 200);
          const rows = (
            await pool.query(
              "SELECT b.id,b.name,b.email,b.phone,b.code,b.status,b.answers,b.form_version,b.created_at,b.slot_id,b.campaign_id,p.title,p.timezone,s.starts_at,s.ends_at FROM bookings b JOIN campaigns p ON p.id=b.campaign_id JOIN interview_slots s ON s.id=b.slot_id WHERE b.company_id=$1 AND ($2='' OR concat_ws(' ',b.name,b.email,b.phone,b.code) ILIKE '%'||$2||'%') ORDER BY b.created_at DESC LIMIT 5000",
              [cid, search],
            )
          ).rows;
          await audit(
            pool,
            user.id,
            cid,
            user.super_admin
              ? "super_admin.participants.read"
              : "bookings.read",
          );
          if (url.searchParams.get("export")) {
            const safe = (s: unknown) =>
              '"' +
              String(s ?? "")
                .replace(/^[\s]*[=+@-]/, "'$&")
                .replace(/"/g, '""') +
              '"';
            const csv = [
              [
                "Kode",
                "Nama",
                "Email",
                "WhatsApp",
                "Gelombang",
                "Waktu UTC",
                "Status",
              ],
              ...rows.map((b) => [
                b.code,
                b.name,
                b.email,
                b.phone,
                b.title,
                b.starts_at.toISOString(),
                b.status,
              ]),
            ]
              .map((row) => row.map(safe).join(","))
              .join("\r\n");
            return new NextResponse("\uFEFF" + csv, {
              headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": 'attachment; filename="peserta.csv"',
                "Cache-Control": "no-store",
              },
            });
          }
          return json(rows);
        }
        if (!id) fail(400, "Booking ID diperlukan");
        const b = z
          .object({
            status: z
              .enum(["confirmed", "attended", "absent", "cancelled"])
              .optional(),
            slot_id: uuid.optional(),
          })
          .parse(await body(req));
        if (b.status === "cancelled")
          await access(pool, user, cid, "bookings.cancel");
        return json(await changeBooking(cid, id, b, user.id));
      }
    }
    fail(404, "Endpoint tidak ditemukan");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    const code = (e as { code?: string }).code;
    if (code === "23505")
      return json(
        { error: "Data duplikat. Periksa slug, email, atau jadwal." },
        409,
      );
    if (code === "23503")
      return json(
        { error: "Data masih digunakan atau relasi tidak valid." },
        409,
      );
    console.error("API failure", { type: (e as Error).name, code });
    return json({ error: "Layanan sedang bermasalah. Coba kembali." }, 500);
  }
}
