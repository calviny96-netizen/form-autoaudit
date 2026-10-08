import { z } from "zod";
export const permissions = [
  "members.read",
  "members.invite",
  "members.update",
  "members.remove",
  "roles.read",
  "roles.create",
  "roles.update",
  "roles.delete",
  "campaigns.read",
  "campaigns.create",
  "campaigns.update",
  "campaigns.publish",
  "campaigns.archive",
  "slots.read",
  "slots.create",
  "slots.update",
  "slots.cancel",
  "bookings.read",
  "bookings.update",
  "bookings.cancel",
  "bookings.export",
  "branding.read",
  "branding.update",
  "settings.read",
  "settings.update",
  "audit.read",
] as const;
const text = z.string().trim();
export const uuid = z.uuid();
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const phone = z
  .string()
  .transform((v) => {
    let p = v.replace(/[\s()+-]/g, "");
    if (p.startsWith("0")) p = "62" + p.slice(1);
    return p;
  })
  .pipe(z.string().regex(/^[1-9]\d{7,14}$/, "Nomor telepon tidak valid"));
export const timezone = text.refine((v) => {
  try {
    new Intl.DateTimeFormat("id", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Zona waktu tidak valid");
const slug = text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(90);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
function luminance(hex: string) {
  const c = hex
    .slice(1)
    .match(/../g)!
    .map((n) => parseInt(n, 16) / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
export const branding = z.object({
  primary: color
    .default("#0369A1")
    .refine(
      (v) => 1.05 / (luminance(v) + 0.05) >= 4.5,
      "Warna utama perlu kontras minimal 4.5:1 terhadap putih",
    ),
  accent: color.default("#7DD3FC"),
  background: z.enum(["#F5FAFF", "#FFFFFF", "#F0F9FF"]).default("#F5FAFF"),
  intro: text.max(1000).default(""),
  heading: text.max(200).default(""),
});
export const success = z
  .object({
    title: text.max(200).default("Selamat, pendaftaran Anda berhasil!"),
    message: text
      .max(2000)
      .default("Silakan hubungi panitia untuk langkah berikutnya."),
    label: text.max(100).default("Hubungi Panitia via WhatsApp"),
    mode: z.enum(["direct", "template"]).default("template"),
    url: text.default("").refine(
      (v) =>
        !v ||
        (() => {
          try {
            const u = new URL(v);
            return (
              u.protocol === "https:" &&
              u.hostname === "wa.me" &&
              !u.username &&
              !u.password &&
              !u.port
            );
          } catch {
            return false;
          }
        })(),
      "Gunakan URL HTTPS dengan hostname wa.me",
    ),
    phone: z.union([z.literal(""), phone]).default(""),
    template: text
      .max(2000)
      .default(
        "Halo Panitia, saya {nama}. Saya mendaftar {gelombang} pada {tanggal}, {jam} {zona_waktu}. Kode booking {kode_booking}.",
      ),
    instructions: text.max(2000).default(""),
  })
  .superRefine((v, ctx) => {
    for (const match of v.template.matchAll(/\{([^}]+)\}/g))
      if (
        ![
          "nama",
          "kode_booking",
          "company",
          "gelombang",
          "tanggal",
          "jam",
          "zona_waktu",
        ].includes(match[1])
      )
        ctx.addIssue({
          code: "custom",
          message: "Variabel template tidak didukung",
        });
  });
export const field = z
  .object({
    id: text.regex(/^[a-zA-Z0-9_-]{1,80}$/),
    label: text.min(1).max(150),
    type: z.enum([
      "text",
      "textarea",
      "email",
      "tel",
      "number",
      "select",
      "radio",
      "checkbox",
      "date",
    ]),
    placeholder: text.max(200).default(""),
    help: text.max(400).default(""),
    required: z.boolean().default(false),
    options: z.array(text.min(1).max(150)).max(50).default([]),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine((v, c) => {
    if (["select", "radio"].includes(v.type) && !v.options.length)
      c.addIssue({ code: "custom", message: "Pilihan jawaban wajib diisi" });
    if (v.min !== undefined && v.max !== undefined && v.min > v.max)
      c.addIssue({ code: "custom", message: "Rentang tidak valid" });
  });
export const fields = z
  .array(field)
  .max(40)
  .refine(
    (v) => new Set(v.map((f) => f.id)).size === v.length,
    "ID field harus unik",
  );
export const companySchema = z.object({
  name: text.min(2).max(150),
  slug,
  contact: text.max(200).default(""),
  timezone: timezone.default("Asia/Jakarta"),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
});
export const campaignSchema = z
  .object({
    title: text.min(2).max(200),
    slug,
    description: text.max(5000).default(""),
    position: text.max(200).default(""),
    location: text.max(500).default(""),
    timezone: timezone.default("Asia/Jakarta"),
    opens_at: z.iso.datetime({ offset: true }).nullable().default(null),
    closes_at: z.iso.datetime({ offset: true }).nullable().default(null),
    status: z
      .enum(["draft", "published", "closed", "archived"])
      .default("draft"),
    fields: fields.default([]),
    success: success.nullable().default(null),
  })
  .refine(
    (v) =>
      !v.opens_at ||
      !v.closes_at ||
      Date.parse(v.closes_at) > Date.parse(v.opens_at),
    "Akhir pendaftaran harus setelah awal",
  );
export const slotSchema = z
  .object({
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }),
    capacity: z.number().int().min(1).max(100000),
    status: z.enum(["open", "closed", "cancelled"]).default("open"),
    note: text.max(1000).default(""),
  })
  .refine(
    (v) => Date.parse(v.ends_at) > Date.parse(v.starts_at),
    "Waktu selesai harus setelah mulai",
  );
export const bookingSchema = z.object({
  slot_id: uuid,
  idempotency_key: uuid,
  name: text.min(2).max(200),
  email,
  phone,
  consent: z.literal(true, { error: "Persetujuan diperlukan" }),
  answers: z
    .record(
      z.string(),
      z.union([
        z.string().max(10000),
        z.boolean(),
        z.array(z.string().max(150)).max(50),
      ]),
    )
    .default({}),
});
export function validateAnswers(
  defs: z.infer<typeof fields>,
  answers: Record<string, unknown>,
) {
  return defs.map((f) => {
    const value = answers[f.id] ?? "";
    const s = String(value);
    if (f.required && (value === "" || value === false))
      throw Error(`${f.label} wajib diisi`);
    if (value !== "") {
      if (f.type === "checkbox" && typeof value !== "boolean")
        throw Error(`${f.label} tidak valid`);
      if (f.type === "email" && !z.email().safeParse(s).success)
        throw Error(`${f.label} tidak valid`);
      if (f.type === "tel" && !phone.safeParse(s).success)
        throw Error(`${f.label} tidak valid`);
      if (["select", "radio"].includes(f.type) && !f.options.includes(s))
        throw Error(`${f.label} tidak valid`);
      if (f.type === "date" && !z.iso.date().safeParse(s).success)
        throw Error(`${f.label} tidak valid`);
      const n = f.type === "number" ? Number(s) : s.length;
      if (f.type === "number" && (!Number.isFinite(n) || !s.trim()))
        throw Error(`${f.label} harus angka`);
      if (
        (f.min !== undefined && n < f.min) ||
        (f.max !== undefined && n > f.max)
      )
        throw Error(`${f.label} di luar batas`);
    }
    return { ...f, value };
  });
}
export function whatsapp(
  config: z.infer<typeof success>,
  values: Record<string, string>,
) {
  const message = config.template.replace(
    /\{([^}]+)\}/g,
    (_, key) => values[key] ?? "",
  );
  return {
    message,
    phone: config.phone,
    url:
      config.mode === "direct"
        ? config.url
        : config.phone
          ? `https://wa.me/${config.phone}?text=${encodeURIComponent(message)}`
          : "",
  };
}
