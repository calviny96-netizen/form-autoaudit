import { duplicateSchema, defaultCalendarDuplicateRule, duplicateTypes } from "./duplicates";
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
  "forms.read",
  "forms.create",
  "forms.update",
  "forms.publish",
  "forms.archive",
  "responses.read",
  "responses.export",
  "responses.delete",
  "branding.read",
  "branding.update",
  "settings.read",
  "settings.update",
  "audit.read",
] as const;
const text = z.string().trim();
export function validationMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(issue => {
    const label = ({ name: "Name", email: "Email", phone: "Phone number", confirm_password: "Confirm password", password: "Password", consent: "Consent" } as Record<string, string>)[String(issue.path[0])] || "";
    return `${label ? label + ": " : ""}${issue.message}`;
  }).join(" ");
  return error instanceof Error ? error.message : "Please check your details and try again.";
}
export const uuid = z.uuid();
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const phone = z
  .string()
  .transform((v) => {
    let p = v.replace(/[\s()+-]/g, "");
    if (p.startsWith("0")) p = "62" + p.slice(1);
    return p;
  })
  .pipe(z.string().regex(/^[1-9]\d{7,14}$/, "Enter a valid phone number"));
export const timezone = text.refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Invalid time zone");
export const password = z.string().min(8, "Use at least 8 characters.").max(256);
export const registrationSchema = z.object({
  name: text.min(2).max(150),
  email,
  phone,
  password,
  confirm_password: z.string(),
}).refine(v => v.password === v.confirm_password, { message: "Passwords do not match.", path: ["confirm_password"] });
export const slug = text.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(90);
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export function luminance(hex: string) {
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
      "The primary color needs at least 4.5:1 contrast against white",
    ),
  accent: color.default("#7DD3FC"),
  background: z.enum(["#F5FAFF", "#FFFFFF", "#F0F9FF"]).default("#F5FAFF"),
  intro: text.max(1000).default(""),
  heading: text.max(200).default(""),
});
// Set by Super Admin per company; company users cannot change it through branding.
export const footer = z.object({
  mode: z.enum(["default", "hidden", "custom"]).default("default"),
  text: text.max(80).default(""),
  image: z
    .union([z.literal(""), z.string().regex(/^\/api\/assets\/[a-f0-9]{64}\.webp$/)])
    .default(""),
  image_width: z.number().int().min(24).max(320).default(104),
  text_size: z.number().int().min(9).max(24).default(12),
});
export const success = z
  .object({
    title: text.max(200).default("Your booking is confirmed!"),
    message: text
      .max(2000)
      .default("Your time is reserved. Keep this confirmation for your records."),
    label: text.max(100).default("Contact organizer on WhatsApp"),
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
      "Use an HTTPS URL on wa.me",
    ),
    phone: z.union([z.literal(""), phone]).default(""),
    template: text
      .max(2000)
      .default(
        "Hello, I'm {name}. I booked {calendar} on {date} at {time} {timezone}. My booking code is {booking_code}.",
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
          "name", "booking_code", "calendar", "date", "time", "timezone",
        ].includes(match[1])
      )
        ctx.addIssue({
          code: "custom",
          message: "Unsupported template variable",
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
      c.addIssue({ code: "custom", message: "Answer options are required" });
    if (v.min !== undefined && v.max !== undefined && v.min > v.max)
      c.addIssue({ code: "custom", message: "Invalid range" });
  });
export const fields = z
  .array(field)
  .max(40)
  .refine(
    (v) => new Set(v.map((f) => f.id)).size === v.length,
    "Field IDs must be unique",
  );
export const companySchema = z.object({
  name: text.min(2).max(150),
  slug,
  contact: text.max(200).default(""),
  timezone: timezone.default("Asia/Jakarta"),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
});
export const standardFieldSetting = z.object({ enabled: z.boolean().default(true), required: z.boolean().default(true) });
export const standardFieldsSchema = z.object({
  name: standardFieldSetting.default({ enabled: true, required: true }),
  email: standardFieldSetting.default({ enabled: true, required: true }),
  phone: standardFieldSetting.default({ enabled: true, required: true }),
});
export const defaultStandardFields = () => standardFieldsSchema.parse({});
export function validateStandardDetails(input: { name: string; email: string; phone: string }, settings: unknown) {
  const config = standardFieldsSchema.parse(settings ?? {});
  const checks = { name: text.min(2).max(200), email, phone };
  const labels = { name: "Full name", email: "Email", phone: "Phone number" };
  const result = { name: "", email: "", phone: "" };
  for (const key of ["name", "email", "phone"] as const) {
    if (!config[key].enabled) continue;
    const value = input[key];
    if (!value && config[key].required) throw Error(labels[key] + " is required");
    if (value && !checks[key].safeParse(value).success) throw Error(labels[key] + " is invalid");
    result[key] = value;
  }
  return result;
}
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
    standard_fields: standardFieldsSchema.default(defaultStandardFields),
    duplicate_rule: duplicateSchema.default(defaultCalendarDuplicateRule),
    success: success.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (!v.duplicate_rule.enabled) return;
    const available = new Set(["booking_date", ...(["name", "email", "phone"] as const).filter(key => v.standard_fields[key].enabled), ...v.fields.filter(f => duplicateTypes.includes(f.type)).map(f => "field:" + f.id)]);
    if (v.duplicate_rule.fields.some(key => !available.has(key))) ctx.addIssue({ code: "custom", message: "Duplicate protection must use fields shown in the booking form." });
  })
  .refine(
    (v) =>
      !v.opens_at ||
      !v.closes_at ||
      Date.parse(v.closes_at) > Date.parse(v.opens_at),
    "Booking must close after it opens",
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
    "End time must be after start time",
  );
export const bookingSchema = z.object({
  slot_id: uuid,
  idempotency_key: uuid,
  name: z.union([text.min(2).max(200), z.literal("")]).default(""),
  email: z.union([email, z.literal("")]).default(""),
  phone: z.union([phone, z.literal("")]).default(""),
  consent: z.literal(true, { error: "Consent is required" }),
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
      throw Error(`${f.label} is required`);
    if (value !== "") {
      if (f.type === "checkbox" && typeof value !== "boolean")
        throw Error(`${f.label} is invalid`);
      if (f.type === "email" && !z.email().safeParse(s).success)
        throw Error(`${f.label} is invalid`);
      if (f.type === "tel" && !phone.safeParse(s).success)
        throw Error(`${f.label} is invalid`);
      if (["select", "radio"].includes(f.type) && !f.options.includes(s))
        throw Error(`${f.label} is invalid`);
      if (f.type === "date" && !z.iso.date().safeParse(s).success)
        throw Error(`${f.label} is invalid`);
      const n = f.type === "number" ? Number(s) : s.length;
      if (f.type === "number" && (!Number.isFinite(n) || !s.trim()))
        throw Error(`${f.label} must be a number`);
      if (
        (f.min !== undefined && n < f.min) ||
        (f.max !== undefined && n > f.max)
      )
        throw Error(`${f.label} is outside the allowed range`);
    }
    return { ...f, value };
  });
}
export function whatsapp(
  config: z.infer<typeof success>,
  values: Record<string, string>,
) {
  values = { ...values, name: values.name ?? values.nama, booking_code: values.booking_code ?? values.kode_booking, calendar: values.calendar ?? values.gelombang, date: values.date ?? values.tanggal, time: values.time ?? values.jam, timezone: values.timezone ?? values.zona_waktu };
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
