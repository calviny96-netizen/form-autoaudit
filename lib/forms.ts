import { duplicateSchema, defaultDuplicateRule, duplicateTypes } from "./duplicates";
import { z } from "zod";
import { fileAnswerSchema } from "./form-files-shared";
import { phone, uuid, color, luminance, slug } from "./schema";

// Shared by the builder, the public form, and the API, so it must stay free of server-only imports.
const text = z.string().trim();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
const target = z.string().max(40).default("");
const asset = z.union([
  z.literal(""),
  z.string().regex(/^\/api\/assets\/[a-f0-9]{64}\.webp$/),
]);
export const languages = ["en", "id"] as const;
export type Lang = (typeof languages)[number];
export const blockTypes = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "choice",
  "multi",
  "dropdown",
  "rating",
  "scale",
  "date",
  "statement",
  "file_upload",
] as const;
export type BlockType = (typeof blockTypes)[number];
export const formBackgrounds = [
  "#F5FAFF",
  "#FFFFFF",
  "#F8FAFC",
  "#F0FDF4",
  "#FFFBEB",
  "#FFF1F2",
  "#F5F3FF",
  "#FDF2F8",
] as const;
export const formIcons = [
  "check",
  "badge",
  "party",
  "sparkles",
  "heart",
  "thumbs",
  "star",
  "trophy",
  "award",
  "gift",
  "rocket",
  "smile",
  "handshake",
  "shield",
  "send",
  "mail",
  "message",
  "phone",
  "calendar",
  "clock",
  "map",
  "globe",
  "link",
  "download",
  "ticket",
  "bag",
  "book",
  "graduation",
  "briefcase",
  "home",
  "coffee",
  "bell",
  "zap",
  "info",
] as const;
export const hasChoices = (b: { type: string }) =>
  ["choice", "multi", "dropdown"].includes(b.type);
export const branches = (b: { type: string }) =>
  b.type === "choice" || b.type === "dropdown";
const option = z.object({
  id,
  label: text.min(1, "Answer options cannot be empty.").max(200),
  goto: target,
});
const block = z
  .object({
    id,
    type: z.enum(blockTypes),
    title: text.min(1, "Every question needs a title.").max(300),
    description: text.max(1000).default(""),
    required: z.boolean().default(false),
    placeholder: text.max(200).default(""),
    options: z.array(option).max(50).default([]),
    min: z.number().optional(),
    max: z.number().optional(),
    low: text.max(60).default(""),
    high: text.max(60).default(""),
    next: target,
  })
  .superRefine((b, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (hasChoices(b)) {
      if (!b.options.length) issue(`"${b.title}" needs at least one answer option.`);
      if (new Set(b.options.map((o) => o.id)).size !== b.options.length)
        issue(`"${b.title}" has duplicate answer options.`);
    }
    if (b.min !== undefined && b.max !== undefined && b.min > b.max)
      issue(`"${b.title}" has a minimum above its maximum.`);
    if (
      (b.type === "rating" || b.type === "scale") &&
      [b.min, b.max].some((n) => n !== undefined && (!Number.isInteger(n) || n < 0 || n > 10))
    )
      issue(`"${b.title}" has an invalid rating range.`);
  });
export function validLink(v: string) {
  try {
    const u = new URL(v);
    return (
      ["https:", "http:", "mailto:", "tel:"].includes(u.protocol) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
const link = text
  .max(2000)
  .refine(validLink, "Button links must start with https://, mailto:, or tel:");
const ending = z.object({
  id,
  title: text.max(200).default(""),
  message: text.max(2000).default(""),
  media: z.enum(["icon", "image", "none"]).default("icon"),
  icon: z.enum(formIcons).default("check"),
  image: asset.default(""),
  buttons: z
    .array(
      z.object({
        id,
        label: text.min(1, "Every button needs a label.").max(60),
        url: link,
        style: z.enum(["primary", "outline", "light"]).default("primary"),
        icon: z.union([z.literal(""), z.enum(formIcons)]).default(""),
        new_tab: z.boolean().default(true),
      }),
    )
    .max(6)
    .default([]),
  restart: z.boolean().default(false),
  restart_label: text.max(60).default(""),
});
export const formDefinition = z
  .object({
    theme: z
      .object({
        primary: color
          .default("#0369A1")
          .refine(
            (v) => 1.05 / (luminance(v) + 0.05) >= 4.5,
            "The button color needs at least 4.5:1 contrast against white",
          ),
        background: z.enum(formBackgrounds).default("#F5FAFF"),
        logo_mode: z.enum(["company", "custom", "none"]).default("company"),
        logo: asset.default(""),
        banner: asset.default(""),
        banner_scope: z.enum(["welcome", "all"]).default("welcome"),
      })
      .prefault({}),
    settings: z
      .object({
        language: z.enum(languages).default("en"),
        progress: z.boolean().default(true),
        numbers: z.boolean().default(true),
        submit_label: text.max(40).default(""),
        duplicate_rule: duplicateSchema.default(defaultDuplicateRule),
      })
      .prefault({}),
    welcome: z
      .object({
        enabled: z.boolean().default(true),
        title: text.max(200).default(""),
        description: text.max(2000).default(""),
        button: text.max(40).default(""),
      })
      .prefault({}),
    blocks: z.array(block).max(100).default([]),
    endings: z.array(ending).min(1).max(10),
  })
  .superRefine((v, ctx) => {
    if (v.settings.duplicate_rule.enabled) {
      const available = new Set(v.blocks.filter(b => duplicateTypes.includes(b.type)).map(b => b.id));
      if (v.settings.duplicate_rule.fields.some(key => !available.has(key))) ctx.addIssue({ code: "custom", message: "Duplicate protection must use available answer questions." });
    }
    const ids = [...v.blocks.map((b) => b.id), ...v.endings.map((e) => e.id)];
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Block and ending IDs must be unique." });
    v.blocks.forEach((b, i) => {
      for (const t of [b.next, ...b.options.map((o) => o.goto)])
        if (t && !validTarget(v, i, t))
          ctx.addIssue({
            code: "custom",
            message: `"${b.title}" jumps to a block that is missing or comes before it.`,
          });
    });
  });
export const formSchema = z.object({
  title: text.min(2).max(200),
  slug,
  status: z.enum(["draft", "published", "closed", "archived"]).default("draft"),
  definition: formDefinition,
});
export const responseSchema = z.object({
  key: uuid,
  answers: z
    .record(
      z.string().max(40),
      z.union([
        z.string().max(10000),
        z.number(),
        z.array(z.string().max(40)).max(50),
        z.null(),
        fileAnswerSchema,
      ]),
    )
    .default({})
    .refine((v) => Object.keys(v).length <= 100, "Too many answers"),
  position: z.string().max(40).default(""),
  complete: z.boolean().default(false),
});
export type FormDefinition = z.infer<typeof formDefinition>;
export type FormBlock = FormDefinition["blocks"][number];
export type FormEnding = FormDefinition["endings"][number];
export type Answers = Record<string, unknown>;
export type StoredAnswer = {
  type: string;
  title: string;
  value: string | number | string[];
  text: string;
  file?: import("./form-files-shared").FileAnswer;
};
type Shape = { blocks: { id: string }[]; endings: { id: string }[] };

// Jumps only go forward or to an ending, so every path through a form terminates.
export function validTarget(def: Shape, from: number, t: string) {
  return (
    def.blocks.findIndex((b) => b.id === t) > from ||
    def.endings.some((e) => e.id === t)
  );
}
export function nextStep(
  def: FormDefinition,
  blockId: string,
  answers: Answers,
): { block: string } | { ending: string } {
  const i = def.blocks.findIndex((b) => b.id === blockId);
  const b = def.blocks[i];
  if (!b) return { ending: def.endings[0].id };
  const picked = branches(b)
    ? b.options.find((o) => o.id === answers[b.id])?.goto
    : "";
  for (const t of [picked, b.next])
    if (t && validTarget(def, i, t))
      return def.endings.some((e) => e.id === t) ? { ending: t } : { block: t };
  return i + 1 < def.blocks.length
    ? { block: def.blocks[i + 1].id }
    : { ending: def.endings[0].id };
}
export function walk(def: FormDefinition, answers: Answers) {
  const path: string[] = [];
  let step: { block: string } | { ending: string } = def.blocks.length
    ? { block: def.blocks[0].id }
    : { ending: def.endings[0].id };
  while ("block" in step) {
    path.push(step.block);
    step = nextStep(def, step.block, answers);
  }
  return { path, ending: step.ending };
}
export function clearInvalidJumps<T extends FormDefinition>(def: T): T {
  return {
    ...def,
    blocks: def.blocks.map((b, i) => ({
      ...b,
      next: b.next && validTarget(def, i, b.next) ? b.next : "",
      options: b.options.map((o) => ({
        ...o,
        goto: o.goto && branches(b) && validTarget(def, i, o.goto) ? o.goto : "",
      })),
    })),
  };
}
export function scaleRange(b: { type: string; min?: number; max?: number }) {
  const clamp = (n: number | undefined, lo: number, hi: number, fallback: number) =>
    n === undefined || !Number.isInteger(n) ? fallback : Math.min(hi, Math.max(lo, n));
  return b.type === "rating"
    ? [1, clamp(b.max, 3, 10, 5)]
    : [b.min === 1 ? 1 : 0, clamp(b.max, 2, 10, 10)];
}
export const isEmptyAnswer = (raw: unknown) =>
  raw === undefined ||
  raw === null ||
  (typeof raw === "string" && !raw.trim()) ||
  (Array.isArray(raw) && !raw.length);

// strict=false keeps whatever a respondent has typed so far; strict=true applies every rule before a form is submitted.
export function readAnswer(
  b: FormBlock,
  raw: unknown,
  lang: Lang,
  strict: boolean,
): StoredAnswer | null {
  const t = formStrings[lang];
  const wrap = (value: StoredAnswer["value"], shown = String(value)) => ({
    type: b.type,
    title: b.title,
    value,
    text: shown,
  });
  const reject = (message: string) => {
    if (strict) throw Error(message);
    return null;
  };
  if (b.type === "statement") return null;
  if (isEmptyAnswer(raw)) return b.required ? reject(t.required) : null;
  switch (b.type) {
    case "file_upload": {
      const file = fileAnswerSchema.safeParse(raw);
      return file.success ? wrap(file.data.id, file.data.name) : reject(t.fileInvalid);
    }
    case "choice":
    case "dropdown": {
      const o = b.options.find((o) => o.id === raw);
      return o ? wrap(o.id, o.label) : reject(t.choose);
    }
    case "multi": {
      const picked = b.options.filter(
        (o) => Array.isArray(raw) && raw.includes(o.id),
      );
      if (!picked.length) return reject(b.required ? t.required : t.choose);
      if (strict && b.min !== undefined && picked.length < b.min)
        throw Error(t.minChoices(b.min));
      if (strict && b.max !== undefined && picked.length > b.max)
        throw Error(t.maxChoices(b.max));
      return wrap(
        picked.map((o) => o.id),
        picked.map((o) => o.label).join(", "),
      );
    }
    case "rating":
    case "scale": {
      const n = Number(raw);
      const [lo, hi] = scaleRange(b);
      return Number.isInteger(n) && n >= lo && n <= hi ? wrap(n) : reject(t.choose);
    }
    case "number": {
      const s = String(raw).trim().replace(",", ".").slice(0, 40);
      const n = Number(s);
      if (!Number.isFinite(n)) return strict ? reject(t.number) : wrap(s);
      if (strict && b.min !== undefined && n < b.min) throw Error(t.minValue(b.min));
      if (strict && b.max !== undefined && n > b.max) throw Error(t.maxValue(b.max));
      return wrap(n);
    }
    case "email": {
      const s = String(raw).trim().slice(0, 254);
      if (z.email().safeParse(s).success) return wrap(s.toLowerCase());
      return strict ? reject(t.email) : wrap(s);
    }
    case "phone": {
      const s = String(raw).trim().slice(0, 40);
      const p = phone.safeParse(s);
      if (p.success) return wrap(p.data);
      return strict ? reject(t.phone) : wrap(s);
    }
    case "date": {
      const s = String(raw).slice(0, 10);
      return z.iso.date().safeParse(s).success ? wrap(s) : reject(t.date);
    }
    default: {
      const cap = b.type === "long_text" ? 5000 : 500;
      const s = String(raw).trim();
      if (strict && b.min !== undefined && s.length < b.min)
        throw Error(t.minLength(b.min));
      if (strict && s.length > Math.min(b.max ?? cap, cap))
        throw Error(t.maxLength(Math.min(b.max ?? cap, cap)));
      return wrap(s.slice(0, cap));
    }
  }
}
// jsonb reorders object keys, so definitions are compared in a key-sorted form.
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
}
export const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "form";
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

export const formStrings = {
  en: {
    start: "Start",
    next: "Next",
    back: "Back",
    submit: "Submit",
    yes: "Yes",
    no: "No",
    required: "Please answer this question.",
    choose: "Choose one of the options.",
    email: "Enter a valid email address.",
    phone: "Enter a valid phone number.",
    number: "Enter a number.",
    date: "Choose a valid date.",
    minValue: (n: number) => `Enter ${n} or more.`,
    maxValue: (n: number) => `Enter ${n} or less.`,
    minLength: (n: number) => `Use at least ${n} characters.`,
    maxLength: (n: number) => `Use up to ${n} characters.`,
    minChoices: (n: number) => `Choose at least ${n}.`,
    maxChoices: (n: number) => `Choose up to ${n}.`,
    chooseMany: "Choose as many as you like",
    enter: "press Enter ↵",
    typeHere: "Type your answer here…",
    select: "Choose an option",
    restart: "Fill out again",
    thanksTitle: "Thank you!",
    thanksMessage: "Your response has been recorded.",
    closedTitle: "This form is closed",
    closedMessage: "It is no longer accepting responses.",
    sending: "Sending your answers…",
    sendFailed:
      "We could not send your answers. Check your connection and try again.",
    retry: "Try again",
    resumed: "Welcome back. Your earlier answers were restored.",
    startOver: "Start over",
    updated: "This form was updated. Please check this question again.",
    question: (n: number, total: number) => `Question ${n} of ${total}`,
    requiredMark: "Required",
    fileInvalid: "Choose a supported file up to 5 MB.",
    fileChoose: "Choose file",
    fileUploading: "Uploading",
    fileProcessing: "Saving file…",
    fileUploaded: "File uploaded",
    fileCancel: "Cancel upload",
    fileLeave: "A file is still uploading. Leave this page and cancel the upload?",
    fileFailed: "Upload failed. Check your connection and choose the file again.",
    filePreview: "File uploads are available on the published form.",
  },
  id: {
    start: "Mulai",
    next: "Lanjut",
    back: "Kembali",
    submit: "Kirim",
    yes: "Ya",
    no: "Tidak",
    required: "Pertanyaan ini wajib dijawab.",
    choose: "Pilih salah satu jawaban.",
    email: "Masukkan alamat email yang valid.",
    phone: "Masukkan nomor telepon yang valid.",
    number: "Masukkan angka.",
    date: "Pilih tanggal yang valid.",
    minValue: (n: number) => `Masukkan angka minimal ${n}.`,
    maxValue: (n: number) => `Masukkan angka maksimal ${n}.`,
    minLength: (n: number) => `Gunakan minimal ${n} karakter.`,
    maxLength: (n: number) => `Gunakan maksimal ${n} karakter.`,
    minChoices: (n: number) => `Pilih minimal ${n}.`,
    maxChoices: (n: number) => `Pilih maksimal ${n}.`,
    chooseMany: "Boleh pilih lebih dari satu",
    enter: "tekan Enter ↵",
    typeHere: "Ketik jawaban di sini…",
    select: "Pilih jawaban",
    restart: "Isi form lagi",
    thanksTitle: "Terima kasih!",
    thanksMessage: "Jawaban Anda sudah kami terima.",
    closedTitle: "Form ini sudah ditutup",
    closedMessage: "Form ini tidak lagi menerima jawaban.",
    sending: "Mengirim jawaban…",
    sendFailed: "Jawaban belum terkirim. Periksa koneksi lalu coba lagi.",
    retry: "Coba lagi",
    resumed: "Selamat datang kembali. Jawaban sebelumnya sudah dipulihkan.",
    startOver: "Mulai dari awal",
    updated: "Form ini diperbarui. Mohon periksa kembali pertanyaan ini.",
    question: (n: number, total: number) => `Pertanyaan ${n} dari ${total}`,
    requiredMark: "Wajib",
    fileInvalid: "Pilih jenis file yang didukung, maksimal 5 MB.",
    fileChoose: "Pilih file",
    fileUploading: "Mengunggah",
    fileProcessing: "Menyimpan file…",
    fileUploaded: "File berhasil diunggah",
    fileCancel: "Batalkan upload",
    fileLeave: "File masih diunggah. Tinggalkan halaman dan batalkan upload?",
    fileFailed: "Upload gagal. Periksa koneksi lalu pilih kembali file Anda.",
    filePreview: "Upload file tersedia pada form yang dipublikasikan.",
  },
};
export type FormStrings = (typeof formStrings)["en"];

// Builder palette: each entry creates a block of an existing type with sensible starting content.
export const blockPresets = [
  { key: "name", type: "short_text", group: "Contact", label: "Name" },
  { key: "email", type: "email", group: "Contact", label: "Email" },
  { key: "phone", type: "phone", group: "Contact", label: "Phone" },
  { key: "short_text", type: "short_text", group: "Text", label: "Short text" },
  { key: "long_text", type: "long_text", group: "Text", label: "Long text" },
  { key: "statement", type: "statement", group: "Text", label: "Statement" },
  { key: "choice", type: "choice", group: "Choice", label: "Multiple choice" },
  { key: "multi", type: "multi", group: "Choice", label: "Checkboxes" },
  { key: "dropdown", type: "dropdown", group: "Choice", label: "Dropdown" },
  { key: "yes_no", type: "choice", group: "Choice", label: "Yes / No" },
  { key: "rating", type: "rating", group: "Rating", label: "Rating" },
  { key: "scale", type: "scale", group: "Rating", label: "Opinion scale" },
  { key: "number", type: "number", group: "Other", label: "Number" },
  { key: "date", type: "date", group: "Other", label: "Date" },
  { key: "file_upload", type: "file_upload", group: "Other", label: "Upload file" },
] as const satisfies readonly { key: string; type: BlockType; group: string; label: string }[];
export type PresetKey = (typeof blockPresets)[number]["key"];
export const typeLabels: Record<BlockType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  email: "Email",
  phone: "Phone number",
  number: "Number",
  choice: "Multiple choice",
  multi: "Checkboxes",
  dropdown: "Dropdown",
  rating: "Rating",
  scale: "Opinion scale",
  date: "Date",
  statement: "Statement",
  file_upload: "Upload file",
};
export function createBlock(key: PresetKey, lang: Lang): FormBlock {
  const idn = lang === "id";
  const preset = blockPresets.find((p) => p.key === key)!;
  const options = (labels: string[]) =>
    labels.map((label) => ({ id: newId(), label, goto: "" }));
  const base: FormBlock = {
    id: newId(),
    type: preset.type,
    title: "",
    description: "",
    required: false,
    placeholder: "",
    options: [],
    low: "",
    high: "",
    next: "",
  };
  const content: Record<PresetKey, Partial<FormBlock>> = {
    name: { title: idn ? "Siapa nama Anda?" : "What's your name?", required: true },
    email: { title: idn ? "Apa alamat email Anda?" : "What's your email address?", placeholder: "name@example.com" },
    phone: { title: idn ? "Berapa nomor WhatsApp Anda?" : "What's your phone number?", placeholder: idn ? "0812 3456 7890" : "+62 812 3456 7890" },
    short_text: { title: idn ? "Pertanyaan Anda" : "Your question" },
    long_text: { title: idn ? "Ceritakan lebih lanjut" : "Tell us more" },
    statement: { title: idn ? "Tulis pesan atau instruksi di sini" : "Share a message or instructions here" },
    choice: { title: idn ? "Pilih salah satu" : "Choose one option", options: options(idn ? ["Pilihan 1", "Pilihan 2"] : ["Option 1", "Option 2"]) },
    multi: { title: idn ? "Pilih semua yang sesuai" : "Choose all that apply", options: options(idn ? ["Pilihan 1", "Pilihan 2"] : ["Option 1", "Option 2"]) },
    dropdown: { title: idn ? "Pilih dari daftar" : "Choose from the list", options: options(idn ? ["Pilihan 1", "Pilihan 2"] : ["Option 1", "Option 2"]) },
    yes_no: { title: idn ? "Ya atau tidak?" : "Yes or no?", options: options([formStrings[lang].yes, formStrings[lang].no]) },
    rating: { title: idn ? "Bagaimana penilaian Anda?" : "How would you rate us?", max: 5 },
    scale: { title: idn ? "Seberapa besar kemungkinan Anda merekomendasikan kami?" : "How likely are you to recommend us?", min: 0, max: 10, low: idn ? "Tidak mungkin" : "Not likely", high: idn ? "Sangat mungkin" : "Very likely" },
    number: { title: idn ? "Masukkan angka" : "Enter a number" },
    date: { title: idn ? "Pilih tanggal" : "Choose a date" },
    file_upload: { title: idn ? "Unggah file Anda" : "Upload your file" },
  };
  return { ...base, ...content[key] };
}
export function createEnding(lang: Lang): FormEnding {
  const t = formStrings[lang];
  return {
    id: newId(),
    title: t.thanksTitle,
    message: t.thanksMessage,
    media: "icon",
    icon: "check",
    image: "",
    buttons: [],
    restart: false,
    restart_label: "",
  };
}
// Response tables keep answers to questions that were later removed from the form.
export function responseColumns(
  definition: { blocks?: { id: string; type: string; title: string }[] },
  rows: { answers?: Record<string, StoredAnswer> }[],
) {
  const columns = (definition.blocks ?? [])
    .filter((b) => b.type !== "statement")
    .map((b) => ({ id: b.id, title: b.title }));
  const known = new Set(columns.map((c) => c.id));
  for (const r of rows)
    for (const [id, a] of Object.entries(r.answers ?? {}))
      if (!known.has(id)) {
        known.add(id);
        columns.push({ id, title: `${a.title} (removed question)` });
      }
  return columns;
}
