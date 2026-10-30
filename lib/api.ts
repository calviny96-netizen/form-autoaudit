import { availableSlug } from "./slugs";
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
  footer,
  success,
  whatsapp,
  password,
  registrationSchema,
  validationMessage,
} from "./schema";
import { createCompany } from "./companies";
import { createBooking, changeBooking } from "./booking";
import { formSchema, canonical, responseColumns } from "./forms";
import { saveResponse } from "./form-responses";
import { scheduleFormFileCleanup } from "./form-file-cleanup";
import { uploadFormFile, downloadFormFile, downloadFormZip, removeResponseFiles } from "./form-files";
import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
const json = (x: unknown, status = 200) =>
  NextResponse.json(x, { status, headers: { "Cache-Control": "no-store" } });
async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 200000) fail(413, "Request is too large");
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, "Invalid request format");
  }
}
async function findCampaign(cid: string, id: string, db: DB = pool) {
  return (
    (
      await db.query("SELECT * FROM campaigns WHERE company_id=$1 AND id=$2", [
        cid,
        id,
      ])
    ).rows[0] ?? fail(404, "Calendar not found")
  );
}
async function findForm(cid: string, id: string, db: DB = pool) {
  return (
    (
      await db.query("SELECT * FROM forms WHERE company_id=$1 AND id=$2", [
        cid,
        id,
      ])
    ).rows[0] ?? fail(404, "Form not found")
  );
}
const csvCell = (s: unknown) =>
  '"' +
  String(s ?? "")
    .replace(/^[\s]*[=+@-]/, "'$&")
    .replace(/"/g, '""') +
  '"';
// Uploads are re-encoded to WebP, so only decoded image data is ever stored or served.
async function storeImage(
  cid: string,
  file: File,
  limit: { bytes: number; pixels: number; edge: number; label: string },
) {
  if (file.size > limit.bytes)
    fail(400, `Maximum ${limit.label} size: ${limit.bytes / 1024 / 1024} MB`);
  const buffer = Buffer.from(await file.arrayBuffer());
  let output;
  try {
    const img = sharp(buffer, { limitInputPixels: limit.pixels });
    const meta = await img.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? ""))
      fail(400, "Use PNG, JPEG, or WebP");
    output = await img
      .rotate()
      .resize({
        width: limit.edge,
        height: limit.edge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(400, "The image is invalid or too large");
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
  return "/api/assets/" + filename;
}
export async function handle(req: Request, parts: string[]) {
  try {
    scheduleFormFileCleanup();
    const method = req.method;
    const route = parts.join("/");
    const url = new URL(req.url);
    if (!["GET", "HEAD"].includes(method)) {
      const origin = req.headers.get("origin");
      const localOrigin =
        (origin === "http://localhost:3210" || origin === "http://127.0.0.1:3210") &&
        req.headers.get("host") === new URL(origin).host;
      if (origin && origin !== new URL(process.env.APP_URL!).origin && !localOrigin)
        fail(403, "Request origin is not allowed");
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
              "SELECT c.id,c.name,c.slug,c.status FROM companies c JOIN company_memberships m ON m.company_id=c.id WHERE m.user_id=$1 AND m.active AND c.status NOT IN ('pending','rejected') AND ($2::uuid IS NULL OR c.id=$2) ORDER BY c.name",
              [user.id, user.impersonating_company_id],
            )
          ).rows;
      return json({ user, companies });
    }
    if (route === "auth/register" && method === "POST") {
      await rateLimit("register:global", 100);
      const b = registrationSchema.parse(await body(req));
      return json(await transaction(async db => {
        if ((await db.query("SELECT 1 FROM users WHERE lower(email)=$1", [b.email])).rowCount)
          fail(409, "This email address is already registered.");
        if ((await db.query("SELECT 1 FROM users WHERE phone=$1", [b.phone])).rowCount)
          fail(409, "This phone number is already registered.");
        const owner = (await db.query("INSERT INTO users(name,email,phone,password_hash,registration_status) VALUES($1,$2,$3,$4,'pending') RETURNING id", [b.name, b.email, b.phone, passwordHash(b.password)])).rows[0];
        const company = await createCompany(db, { name: b.name, contact: b.email, status: "pending" }, owner.id);
        await audit(db, owner.id, company.id, "company.registration.submitted", company.id);
        return { ok: true, status: "pending" };
      }), 201);
    }
    if (route === "auth/stop-impersonation" && method === "POST") {
      const t = req.headers.get("cookie")?.match(/(?:^|;\s*)aa_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (!t) fail(401, "Please sign in first.");
      await transaction(async db => {
        const s = (await db.query("SELECT s.*,u.super_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active FOR UPDATE OF s", [hash(t)])).rows[0];
        if (!s?.super_admin) fail(403, "Only Super Admin can end a company session.");
        await db.query("UPDATE sessions SET acting_company_id=NULL,acting_user_id=NULL WHERE token_hash=$1", [hash(t)]);
        await audit(db, s.user_id, s.acting_company_id, "company.login_as.ended", s.acting_user_id);
      });
      return json({ ok: true });
    }
    if (route === "auth/login" && method === "POST") {
      const b = z
        .object({ email, password: z.string().min(1).max(256) })
        .parse(await body(req));
      await rateLimit("login:global", 300);
      await rateLimit("login:" + b.email, 15);
      const u = (
        await pool.query("SELECT * FROM users WHERE lower(email)=$1", [b.email])
      ).rows[0];
      if (!verifyPassword(b.password, u?.password_hash ?? null) || !u?.active)
        fail(401, "Incorrect email or password");
      if (u.registration_status === "pending") fail(403, "Your company is awaiting approval. Please wait for Super Admin to review your account.");
      if (u.registration_status === "rejected") fail(403, "Your company registration was rejected. Please contact support.");
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
          password,
        })
        .parse(await body(req));
      await transaction(async (db) => {
        const t = (
          await db.query(
            "SELECT * FROM access_tokens WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE",
            [hash(b.token)],
          )
        ).rows[0];
        if (!t) fail(400, "This link is invalid or has expired");
        await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
          passwordHash(b.password),
          t.user_id,
        ]);
        await db.query(
          "UPDATE access_tokens SET used_at=now() WHERE token_hash=$1",
          [hash(b.token)],
        );
        await db.query("DELETE FROM sessions WHERE user_id=$1 OR acting_user_id=$1", [t.user_id]);
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
        fail(404, "Asset not found");
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
      if (!c) fail(404, "Booking link not found");
      const p = (
        await pool.query(
          "SELECT * FROM campaigns WHERE company_id=$1 AND slug=$2 AND status<>'draft' AND status<>'archived'",
          [c.id, parts[2]],
        )
      ).rows[0];
      if (!p) fail(404, "Booking link not found");
      if (method === "POST") {
        await rateLimit("booking:global", 3000);
        return json(await createBooking(c.id, p.id, await body(req)));
      }
      if (c.status !== "active")
        fail(409, "This company is inactive. Booking is temporarily unavailable.");
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
      if (!b) fail(404, "Booking not found");
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
          tanggal: date.toLocaleDateString("en-GB", {
            timeZone: b.timezone,
            dateStyle: "long",
          }),
          jam: date.toLocaleTimeString("en-GB", {
            timeZone: b.timezone,
            hour: "2-digit",
            minute: "2-digit",
          }),
          zona_waktu: b.timezone,
        }),
      });
    }
    if (parts[0] === "public-forms" && (parts.length === 3 || (parts.length === 4 && parts[3] === "files" && method === "POST"))) {
      const c = (
        await pool.query("SELECT * FROM companies WHERE slug=$1", [parts[1]])
      ).rows[0];
      const f =
        c &&
        (
          await pool.query(
            "SELECT * FROM forms WHERE company_id=$1 AND slug=$2 AND status IN ('published','closed')",
            [c.id, parts[2]],
          )
        ).rows[0];
      if (!f) fail(404, "Form not found");
      if (parts[3] === "files") return json(await uploadFormFile(req, c, f));
      if (method === "POST") {
        await rateLimit("form:global", 30000);
        return json(await saveResponse(c, f, await body(req)));
      }
      if (c.status !== "active")
        fail(409, "This company is inactive. This form is temporarily unavailable.");
      return json({
        company: { name: c.name, slug: c.slug, branding: c.branding },
        form: {
          title: f.title,
          slug: f.slug,
          status: f.status,
          version: f.version,
          definition: f.definition,
        },
      });
    }
    const user = await requireUser(req);
    if (parts[0] === "platform") {
      if (!user.super_admin) fail(403, "Only Super Admin can perform this action");
      if (parts[1] === "companies" && parts[2] && parts[3] === "links") {
        const cid = uuid.parse(parts[2]);
        if (method === "GET") return json((await pool.query("SELECT id,title,slug,'calendar' AS kind FROM campaigns WHERE company_id=$1 UNION ALL SELECT id,title,slug,'form' AS kind FROM forms WHERE company_id=$1 ORDER BY title", [cid])).rows);
        const input = z.object({ id: uuid, kind: z.enum(["calendar", "form"]), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(90) }).parse(await body(req));
        return json(await transaction(async db => {
          await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [cid]);
          const table = input.kind === "calendar" ? "campaigns" : "forms";
          const updated = await db.query(`UPDATE ${table} SET slug=$1 WHERE company_id=$2 AND id=$3 RETURNING id`, [input.slug, cid, input.id]);
          if (!updated.rowCount) fail(404, "Link not found");
          await audit(db, user.id, cid, "company.link.updated", input.id);
          return { ok: true };
        }));
      }
      if (parts[1] === "overview")
        return json(
          (
            await pool.query(
              "SELECT (SELECT count(*) FROM companies WHERE status='active') AS companies,(SELECT count(*) FROM companies WHERE status='pending') AS pending,(SELECT count(*) FROM companies WHERE status='inactive') AS inactive,(SELECT count(*) FROM users WHERE NOT super_admin) AS users",
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
                "SELECT id,name,email,phone,active,super_admin,registration_status FROM users ORDER BY created_at DESC",
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
          .object({ action: z.enum(["reset", "disable", "enable"]), password: password.optional(), confirm_password: z.string().optional() })
          .parse(await body(req));
        if (b.action === "reset" && (!b.password || b.password !== b.confirm_password))
          fail(400, "Enter a new password of at least 8 characters and matching confirmation.");
        if (b.action === "reset")
          return json(
            await transaction(async (db) => {
              const u = (
                await db.query("SELECT id FROM users WHERE id=$1", [uid])
              ).rows[0];
              if (!u) fail(404, "User not found");
              await db.query("DELETE FROM sessions WHERE user_id=$1 OR acting_user_id=$1", [uid]);
              await audit(db, user.id, null, "access.reset", uid);
              await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [passwordHash(b.password!), uid]);
              await db.query("DELETE FROM access_tokens WHERE user_id=$1", [uid]);
              return { ok: true };
            }),
          );
        await transaction(async (db) => {
          await db.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
          if (b.action === "disable") {
            if (uid === user.id)
              fail(400, "You cannot disable your own account");
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
                "Transfer company ownership before disabling the owner",
              );
          }
          await db.query("UPDATE users SET active=$1 WHERE id=$2", [
            b.action === "enable",
            uid,
          ]);
          await db.query("DELETE FROM sessions WHERE user_id=$1 OR acting_user_id=$1", [uid]);
          await audit(db, user.id, null, "user." + b.action, uid);
        });
        return json({ ok: true });
      }
      if (parts[1] === "pending-companies" && method === "GET") {
        return json((await pool.query("SELECT c.*,u.email,u.phone FROM companies c JOIN users u ON u.id=c.registered_by WHERE c.status='pending' ORDER BY c.created_at")).rows);
      }
      if (parts[1] === "companies" && parts[2] && parts[3] === "review" && method === "POST") {
        const cid = uuid.parse(parts[2]);
        const b = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().max(1000).default("") }).parse(await body(req));
        return json(await transaction(async db => {
          const c = (await db.query("SELECT * FROM companies WHERE id=$1 FOR UPDATE", [cid])).rows[0];
          if (!c) fail(404, "Company not found.");
          if (c.status !== "pending") fail(409, "This registration has already been reviewed.");
          await db.query("UPDATE companies SET status=$1,reviewed_by=$2,reviewed_at=now(),rejection_reason=$3 WHERE id=$4", [b.action === "approve" ? "active" : "rejected", user.id, b.reason, cid]);
          await db.query("UPDATE users SET registration_status=$1 WHERE id=$2", [b.action === "approve" ? "approved" : "rejected", c.registered_by]);
          await audit(db, user.id, cid, "company.registration." + b.action, cid);
          return { ok: true };
        }));
      }
      if (parts[1] === "companies" && parts[2] && parts[3] === "footer-image" && method === "POST") {
        const cid = uuid.parse(parts[2]);
        if (!(await pool.query("SELECT 1 FROM companies WHERE id=$1", [cid])).rowCount) fail(404, "Company not found.");
        const file = (await req.formData()).get("file");
        if (!(file instanceof File)) fail(400, "Choose an image file");
        return json({ url: await storeImage(cid, file, { bytes: 2 * 1024 * 1024, pixels: 16000000, edge: 800, label: "image" }) });
      }
      if (parts[1] === "companies" && parts[2] && parts[3] === "footer" && method === "POST") {
        const cid = uuid.parse(parts[2]);
        const b = footer.parse(await body(req));
        const r = await pool.query("UPDATE companies SET branding=jsonb_set(branding,'{footer}',$1::jsonb) WHERE id=$2", [JSON.stringify(b), cid]);
        if (!r.rowCount) fail(404, "Company not found.");
        await audit(pool, user.id, cid, "company.footer.updated", cid);
        return json(b);
      }
      if (parts[1] === "companies" && parts[2] && parts[3] === "owner" && method === "POST") {
        const cid = uuid.parse(parts[2]);
        const b = registrationSchema.parse(await body(req));
        return json(await transaction(async db => {
          const c = (await db.query("SELECT * FROM companies WHERE id=$1 FOR UPDATE", [cid])).rows[0];
          if (!c) fail(404, "Company not found.");
          if (["pending", "rejected"].includes(c.status)) fail(409, "Review this registration before changing ownership.");
          if ((await db.query("SELECT 1 FROM company_memberships m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.active AND r.owner AND NOT u.super_admin", [cid])).rowCount)
            fail(409, "This company already has a Company Owner.");
          const role = (await db.query("SELECT id FROM roles WHERE company_id=$1 AND owner", [cid])).rows[0];
          if (!role) fail(409, "The Company Owner role is missing.");
          const owner = (await db.query("INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id", [b.name, b.email, b.phone, passwordHash(b.password)])).rows[0];
          await db.query("INSERT INTO company_memberships(company_id,user_id,role_id) VALUES($1,$2,$3)", [cid, owner.id, role.id]);
          await db.query("UPDATE companies SET registered_by=$1,contact=$2 WHERE id=$3", [owner.id, b.email, cid]);
          await audit(db, user.id, cid, "company.owner.created", owner.id);
          return { ok: true };
        }));
      }
      if (parts[1] === "companies" && parts[2] && parts[3] === "login-as" && method === "POST") {
        const cid = uuid.parse(parts[2]);
        const t = req.headers.get("cookie")?.match(/(?:^|;\s*)aa_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (!t) fail(401, "Please sign in first.");
        return json(await transaction(async db => {
          const c = (await db.query("SELECT id FROM companies WHERE id=$1 AND status='active' FOR UPDATE", [cid])).rows[0];
          if (!c) fail(409, "Only active companies can be opened.");
          const owner = (await db.query("SELECT u.id FROM company_memberships m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.active AND r.owner AND u.active AND NOT u.super_admin AND u.registration_status='approved' ORDER BY u.created_at LIMIT 1", [cid])).rows[0];
          if (!owner) fail(409, "This company needs an active Company Owner before you can log in as the company.");
          await db.query("UPDATE sessions SET acting_company_id=$1,acting_user_id=$2 WHERE token_hash=$3 AND user_id=$4", [cid, owner.id, hash(t), user.id]);
          await audit(db, user.id, cid, "company.login_as.started", owner.id);
          return { ok: true };
        }));
      }
      if (parts[1] === "companies") {
        if (method === "GET")
          return json(
            (
              await pool.query(
                "SELECT c.*,u.email AS owner_email,u.phone AS owner_phone,u.id AS owner_id,(SELECT count(*) FROM campaigns p WHERE p.company_id=c.id) AS campaigns,(SELECT count(*) FROM bookings b WHERE b.company_id=c.id AND b.status<>'cancelled') AS bookings,(SELECT count(*) FROM interview_slots s WHERE s.company_id=c.id) AS slots,(SELECT coalesce(sum(capacity),0) FROM interview_slots s WHERE s.company_id=c.id) AS capacity FROM companies c LEFT JOIN LATERAL (SELECT owner.id,owner.email,owner.phone FROM users owner WHERE owner.id=c.registered_by OR (NOT owner.super_admin AND EXISTS(SELECT 1 FROM company_memberships m JOIN roles r ON r.id=m.role_id WHERE m.company_id=c.id AND m.user_id=owner.id AND m.active AND r.owner)) ORDER BY (owner.id=c.registered_by) DESC NULLS LAST,owner.created_at LIMIT 1) u ON true ORDER BY c.created_at DESC",
              )
            ).rows,
          );
        const raw = await body(req);
        const b = companySchema.parse({ ...raw, slug: raw.slug || (String(raw.name || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 65) || "company") + "-" + token().slice(0, 8) });
        const registration = !parts[2] ? registrationSchema.parse(raw) : undefined;
        return json(
          await transaction(async (db) => {
            if (parts[2]) {
              const cid = uuid.parse(parts[2]);
              const existing = (await db.query("SELECT status FROM companies WHERE id=$1 FOR UPDATE", [cid])).rows[0];
              if (!existing) fail(404, "Company not found.");
              if (["pending", "rejected"].includes(existing.status)) fail(409, "Use Pending companies to review registrations.");
              const r = (
                await db.query(
                  "UPDATE companies SET name=$1,slug=$2,contact=$3,timezone=$4,status=$5 WHERE id=$6 RETURNING *",
                  [b.name, b.slug, b.contact, b.timezone, b.status, cid],
                )
              ).rows[0];
              if (!r) fail(404, "Company not found");
              await audit(db, user.id, cid, "company.updated", cid);
              return r;
            }
            let ownerId: string | undefined;
            if (registration) {
              ownerId = (await db.query("INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id", [registration.name, registration.email, registration.phone, passwordHash(registration.password)])).rows[0].id;
            }
            const c = await createCompany(db, { ...b, contact: b.contact || registration?.email }, ownerId);
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
        if (!(file instanceof File)) fail(400, "Choose a logo file");
        const setting = (
          await pool.query("SELECT settings FROM platform_settings")
        ).rows[0].settings;
        const url = await storeImage(cid, file, {
          bytes: Math.min(setting.upload_max_mb ?? 2, 2) * 1024 * 1024,
          pixels: 16000000,
          edge: 1000,
          label: "logo",
        });
        await pool.query(
          "UPDATE companies SET branding=jsonb_set(branding,'{logo}',$1::jsonb) WHERE id=$2",
          [JSON.stringify(url), cid],
        );
        await audit(pool, user.id, cid, "branding.logo", cid);
        return json({ url });
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
            if (id && !old) fail(404, "Role not found");
            if (old?.owner) fail(403, "The Owner role cannot be changed");
            if (method === "DELETE") {
              if (
                !user.super_admin &&
                !membership.owner &&
                old.permissions.some(
                  (p: string) => !membership.permissions.includes(p),
                )
              )
                fail(403, "This role exceeds your permissions");
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
              fail(403, "You cannot grant permissions you do not have");
            if (
              old &&
              !m.owner &&
              !user.super_admin &&
              old.permissions.some((p: string) => !m.permissions.includes(p))
            )
              fail(403, "This role exceeds your permissions");
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
            if (!role) fail(400, "Invalid role");
            const m = await access(db, user, cid);
            if (
              !user.super_admin &&
              !m.owner &&
              (role.owner ||
                role.permissions.some(
                  (p: string) => !m.permissions.includes(p),
                ))
            )
              fail(403, "This role exceeds your permissions");
            let uid: string;
            if (id) {
              const old = (
                await db.query(
                  "SELECT m.*,r.owner,r.permissions FROM company_memberships m JOIN roles r ON r.id=m.role_id WHERE m.company_id=$1 AND m.id=$2",
                  [cid, id],
                )
              ).rows[0];
              if (!old) fail(404, "Member not found");
              if (
                !user.super_admin &&
                !m.owner &&
                (old.owner ||
                  old.permissions.some(
                    (p: string) => !m.permissions.includes(p),
                  ))
              )
                fail(403, "This member has permissions you cannot manage");
              if (!b.active) await access(db, user, cid, "members.remove");
              if (old.owner && old.active && (!role.owner || !b.active)) {
                const n = (
                  await db.query(
                    "SELECT count(*)::int AS n FROM company_memberships m JOIN roles r ON r.id=m.role_id JOIN users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.active AND r.owner AND u.active",
                    [cid],
                  )
                ).rows[0].n;
                if (n <= 1)
                  fail(409, "A company must have at least one active Owner");
              }
              uid = old.user_id;
              await db.query(
                "UPDATE company_memberships SET role_id=$1,active=$2 WHERE id=$3",
                [role.id, b.active, id],
              );
            } else {
              let u = (
                await db.query("SELECT id FROM users WHERE lower(email)=$1", [b.email])
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
                  "Only Super Admin can reset an account used across companies",
                );
              await db.query("DELETE FROM sessions WHERE user_id=$1 OR acting_user_id=$1", [uid]);
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
        const raw = await body(req);
        return json(
          await transaction(async (db) => {
            await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
              cid,
            ]);
            const old = id ? await findCampaign(cid, id, db) : null;
            const b = campaignSchema.parse({ ...raw, standard_fields: raw.standard_fields ?? old?.standard_fields, duplicate_rule: raw.duplicate_rule ?? old?.duplicate_rule, slug: old?.slug ?? await availableSlug(db, "campaigns", cid, String(raw.title || "")) });
            if (b.status === "published" || old?.status === "published")
              await access(db, user, cid, "campaigns.publish");
            if (b.status === "archived")
              await access(db, user, cid, "campaigns.archive");
            const changed =
              !old || JSON.stringify(old.fields) !== JSON.stringify(b.fields) || JSON.stringify(old.standard_fields) !== JSON.stringify(b.standard_fields);
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
              JSON.stringify(b.standard_fields),
              JSON.stringify(b.duplicate_rule),
            ];
            const p = id
              ? (
                  await db.query(
                    "UPDATE campaigns SET title=$1,slug=$2,description=$3,position=$4,location=$5,timezone=$6,opens_at=$7,closes_at=$8,status=$9,form_version=$10,fields=$11,success=$12,standard_fields=$14,duplicate_rule=$15 WHERE company_id=$13 AND id=$16 RETURNING *",
                    [...values, id],
                  )
                ).rows[0]
              : (
                  await db.query(
                    "INSERT INTO campaigns(title,slug,description,position,location,timezone,opens_at,closes_at,status,form_version,fields,success,company_id,standard_fields,duplicate_rule) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *",
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
      if (module === "form-assets" && method === "POST") {
        const m = await access(pool, user, cid);
        if (
          !m.owner &&
          !["forms.create", "forms.update"].some((p) =>
            m.permissions.includes(p),
          )
        )
          fail(403, "You do not have permission to perform this action.");
        const data = await req.formData();
        const file = data.get("file");
        if (!(file instanceof File)) fail(400, "Choose an image file");
        const url = await storeImage(cid, file, {
          bytes: 5 * 1024 * 1024,
          pixels: 40000000,
          edge: data.get("kind") === "banner" ? 2000 : 800,
          label: "image",
        });
        await audit(pool, user.id, cid, "form.asset", cid);
        return json({ url });
      }
      if (module === "forms" && parts[4] === "files" && id && method === "GET") {
        const form = await findForm(cid, id);
        await access(pool, user, cid, parts[5] ? "responses.read" : "responses.export");
        await audit(pool, user.id, cid, parts[5] ? "form.file.download" : "form.files.export", id);
        return await (parts[5] ? downloadFormFile(req, cid, id, parts[5]) : downloadFormZip(req, cid, form));
      }
      if (module === "forms" && parts[4] === "responses" && id) {
        const form = await findForm(cid, id);
        if (method === "DELETE") {
          await access(pool, user, cid, "responses.delete");
          const rid = uuid.parse(parts[5]);
          await removeResponseFiles(cid, id, rid);
          await audit(pool, user.id, cid, "form.response.deleted", rid);
          return json({ ok: true });
        }
        if (method !== "GET") fail(404, "Endpoint not found");
        const exporting = !!url.searchParams.get("export");
        await access(
          pool,
          user,
          cid,
          exporting ? "responses.export" : "responses.read",
        );
        const status = z
          .enum(["", "partial", "completed"])
          .parse(url.searchParams.get("status") ?? "");
        const search = (url.searchParams.get("q") ?? "").slice(0, 200);
        const rows = (
          await pool.query(
            "SELECT id,status,form_version,answers,position,ending_id,started_at,updated_at,completed_at FROM form_responses r WHERE company_id=$1 AND form_id=$2 AND ($3='' OR status=$3) AND ($4='' OR EXISTS(SELECT 1 FROM jsonb_each(r.answers) a WHERE a.value->>'text' ILIKE '%'||$4||'%')) ORDER BY started_at DESC LIMIT 5000",
            [cid, id, status, search],
          )
        ).rows;
        const fileIds = rows.flatMap(r => Object.values(r.answers).flatMap((a: any) => a.type === "file_upload" && a.file?.id ? [a.file.id] : []));
        if (fileIds.length) {
          const files = new Map((await pool.query("SELECT id,expires_at,deleted_at FROM form_files WHERE company_id=$1 AND form_id=$2 AND id=ANY($3::uuid[])", [cid, id, fileIds])).rows.map(f => [f.id, f]));
          for (const row of rows) for (const answer of Object.values(row.answers) as any[]) {
            if (answer.type !== "file_upload" || !answer.file) continue;
            const file = files.get(answer.file.id);
            answer.file = { ...answer.file, expires_at: file?.expires_at.toISOString(), available: !!file && !file.deleted_at && file.expires_at > new Date() };
          }
        }
        await audit(
          pool,
          user.id,
          cid,
          user.super_admin ? "super_admin.responses.read" : "responses.read",
          id,
        );
        if (exporting) {
          const columns = responseColumns(form.definition, rows);
          const endings = new Map<string, string>(
            form.definition.endings.map((e: any) => [e.id, e.title]),
          );
          const csv = [
            [
              "Status",
              "Started (UTC)",
              "Last updated (UTC)",
              "Completed (UTC)",
              "Ending",
              ...columns.map((c) => c.title),
            ],
            ...rows.map((r) => [
              r.status,
              r.started_at.toISOString(),
              r.updated_at.toISOString(),
              r.completed_at?.toISOString() ?? "",
              endings.get(r.ending_id) ?? "",
              ...columns.map((c) => r.answers[c.id]?.text ?? ""),
            ]),
          ]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n");
          return new NextResponse("\uFEFF" + csv, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="${form.slug}-responses.csv"`,
              "Cache-Control": "no-store",
            },
          });
        }
        return json({
          form,
          rows,
          counts: (
            await pool.query(
              "SELECT count(*)::int AS total,count(*) FILTER (WHERE status='completed')::int AS completed,(SELECT count(*)::int FROM form_files f JOIN form_responses r ON r.id=f.response_id WHERE f.company_id=$1 AND f.form_id=$2 AND r.answers->f.block_id->>'value'=f.id::text AND f.deleted_at IS NULL AND f.expires_at>now()) AS files,(SELECT min(f.expires_at) FROM form_files f JOIN form_responses r ON r.id=f.response_id WHERE f.company_id=$1 AND f.form_id=$2 AND r.answers->f.block_id->>'value'=f.id::text AND f.deleted_at IS NULL AND f.expires_at>now()) AS next_file_expiry FROM form_responses WHERE company_id=$1 AND form_id=$2",
              [cid, id],
            )
          ).rows[0],
        });
      }
      if (module === "forms") {
        await access(
          pool,
          user,
          cid,
          `forms.${method === "GET" ? "read" : id ? "update" : "create"}`,
        );
        if (method === "GET") {
          if (id) return json(await findForm(cid, id));
          return json(
            (
              await pool.query(
                "SELECT f.id,f.title,f.slug,f.status,f.version,f.created_at,f.updated_at,jsonb_array_length(f.definition->'blocks') AS blocks,(SELECT count(*) FROM form_responses r WHERE r.form_id=f.id) AS responses,(SELECT count(*) FROM form_responses r WHERE r.form_id=f.id AND r.status='completed') AS completed FROM forms f WHERE company_id=$1 ORDER BY created_at DESC",
                [cid],
              )
            ).rows,
          );
        }
        const raw = await body(req);
        return json(
          await transaction(async (db) => {
            await db.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
              cid,
            ]);
            const old = id ? await findForm(cid, id, db) : null;
            const b = formSchema.parse({ ...raw, slug: old?.slug ?? await availableSlug(db, "forms", cid, String(raw.title || "")) });
            if (b.status === "published" || old?.status === "published")
              await access(db, user, cid, "forms.publish");
            if (b.status === "archived")
              await access(db, user, cid, "forms.archive");
            if (b.status === "published" && !b.definition.blocks.length)
              fail(400, "Add at least one question before publishing.");
            const changed =
              !old || canonical(old.definition) !== canonical(b.definition);
            const values = [
              b.title,
              b.slug,
              b.status,
              old ? old.version + (changed ? 1 : 0) : 1,
              JSON.stringify(b.definition),
              cid,
            ];
            const f = id
              ? (
                  await db.query(
                    "UPDATE forms SET title=$1,slug=$2,status=$3,version=$4,definition=$5,updated_at=now() WHERE company_id=$6 AND id=$7 RETURNING *",
                    [...values, id],
                  )
                ).rows[0]
              : (
                  await db.query(
                    "INSERT INTO forms(title,slug,status,version,definition,company_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
                    values,
                  )
                ).rows[0];
            await audit(db, user.id, cid, "form.saved", f.id);
            return f;
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
                if (!old) fail(404, "Time slot not found");
                const n = (
                  await db.query(
                    "SELECT count(*)::int AS n FROM bookings WHERE slot_id=$1 AND status<>'cancelled'",
                    [id],
                  )
                ).rows[0].n;
                if (s.capacity < n)
                  fail(409, "Capacity cannot be lower than the number of active bookings");
                if (
                  n &&
                  (new Date(s.starts_at).getTime() !==
                    new Date(old.starts_at).getTime() ||
                    new Date(s.ends_at).getTime() !==
                      new Date(old.ends_at).getTime())
                )
                  fail(
                    409,
                    "Move bookings before changing the time of a booked slot",
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
            const safe = csvCell;
            const csv = [
              [
                "Code",
                "Name",
                "Email",
                "Phone",
                "Calendar",
                "Time (UTC)",
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
                "Content-Disposition": 'attachment; filename="bookings.csv"',
                "Cache-Control": "no-store",
              },
            });
          }
          return json(rows);
        }
        if (!id) fail(400, "Booking ID is required");
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
    fail(404, "Endpoint not found");
  } catch (e) {
    if (e instanceof HttpError)
      return json({ error: e.message, ...e.extra }, e.status);
    if (e instanceof z.ZodError)
      return json(
        {
          error: validationMessage(e),
        },
        400,
      );
    const code = (e as { code?: string }).code;
    if (code === "23505" && /users.*email/.test((e as any).constraint || "")) return json({ error: "This email address is already registered." }, 409);
    if (code === "23505" && (e as any).constraint === "users_phone_unique") return json({ error: "This phone number is already registered." }, 409);
    if (code === "23505" && (e as any).constraint === "forms_company_id_slug_key")
      return json({ error: "Another form already uses this link. Choose a different link." }, 409);
    if (code === "23505")
      return json(
        { error: "Duplicate record. Check the slug, email, phone, or time slot." },
        409,
      );
    if (code === "23503")
      return json(
        { error: "The record is in use or has an invalid relationship." },
        409,
      );
    console.error("API failure", { type: (e as Error).name, code });
    return json({ error: "The service is temporarily unavailable. Please try again." }, 500);
  }
}
