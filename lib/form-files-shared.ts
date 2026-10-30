import { z } from "zod";
export const FORM_FILE_RETENTION_DAYS = 30;
export const MAX_FORM_FILE_BYTES = 5 * 1024 * 1024;
export const FORM_FILE_EXTENSIONS = ["jpeg", "jpg", "png", "svg", "pdf", "md", "doc", "docx", "xlsx", "csv"] as const;
export const FORM_FILE_ACCEPT = FORM_FILE_EXTENSIONS.map(ext => `.${ext}`).join(",");
export const fileAnswerSchema = z.object({ id: z.uuid(), name: z.string().min(1).max(180), size: z.number().int().min(1).max(MAX_FORM_FILE_BYTES), expires_at: z.iso.datetime().optional(), available: z.boolean().optional() });
export type FileAnswer = z.infer<typeof fileAnswerSchema>;
export function fileExtension(name: string) { return name.split(".").pop()?.toLowerCase() ?? ""; }
export function validFormFile(name: string, size: number) {
  return size > 0 && size <= MAX_FORM_FILE_BYTES && FORM_FILE_EXTENSIONS.some(ext => ext === fileExtension(name));
}
