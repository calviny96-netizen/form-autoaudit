import { z } from "zod";
export const duplicateSchema = z.object({
  enabled: z.boolean().default(false),
  fields: z.array(z.string().min(1).max(80)).max(40).default([]),
  match: z.enum(["any", "all"]).default("any"),
  message: z.string().trim().min(1).max(1000).default("A submission with the same details already exists. Please check your details."),
}).refine(v => !v.enabled || v.fields.length > 0, "Select at least one field for duplicate protection.")
  .refine(v => new Set(v.fields).size === v.fields.length, "Duplicate protection fields must be unique.");
export type DuplicateRule = z.infer<typeof duplicateSchema>;
export const defaultDuplicateRule = () => duplicateSchema.parse({});
export const defaultCalendarDuplicateRule = () => duplicateSchema.parse({ enabled: true, fields: ["email"], message: "This email already has an active booking in this calendar." });
export const duplicateTypes = ["text", "textarea", "email", "tel", "date", "number", "select", "radio", "short_text", "long_text", "phone", "choice", "dropdown", "rating", "scale"];
export function normalizeDuplicate(value: unknown, type: string) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).trim();
  if (type === "tel" || type === "phone") {
    const digits = text.replace(/[^0-9]/g, "");
    return digits.startsWith("0") ? "62" + digits.slice(1) : digits;
  }
  return text.toLowerCase();
}
export function duplicateSqlValue(expression: string, type: string) {
  if (type === "tel" || type === "phone") {
    const digits = `regexp_replace(coalesce(${expression},''),'[^0-9]','','g')`;
    return `(CASE WHEN left(${digits},1)='0' THEN '62'||substring(${digits} from 2) ELSE ${digits} END)`;
  }
  return `lower(btrim(coalesce(${expression},'')))`;
}
// ALL needs values for every selected field; ANY compares only non-empty values.
export function duplicateCandidates<T extends { value: string }>(rule: DuplicateRule, values: T[]) {
  if (!rule.enabled || (rule.match === "all" && values.some(v => !v.value))) return [];
  return values.filter(v => v.value !== "");
}
