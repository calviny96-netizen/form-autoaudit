import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, unlink, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { once } from "node:events";
import archiver from "archiver";
import { pool, transaction, fail, HttpError, type DB } from "./db";
import { rateLimit } from "./auth";
import { scheduleFormFileCleanup } from "./form-file-cleanup";
import { uuid } from "./schema";
import { formDefinition, type StoredAnswer } from "./forms";
import { MAX_FORM_FILE_BYTES, fileExtension, validFormFile, type FileAnswer, FORM_FILE_RETENTION_DAYS } from "./form-files-shared";

// Limits are per server process; no database connection is held while transferring bytes.
const transfers = globalThis as typeof globalThis & { formTransfers?: { uploads: number; downloads: number } };
const active = transfers.formTransfers ??= { uploads: 0, downloads: 0 };
export function formFilePath(name: string) {
  if (!/^[a-f0-9-]{36}$/.test(name)) fail(400, "Invalid stored file");
  return path.join(process.env.UPLOAD_DIR!, "form-files", name);
}
function safeName(name: string) {
  return name.normalize("NFC").replace(/[\x00-\x1f\x7f/\\]/g, "_").trim().slice(-180);
}
const metadata = (row: any): FileAnswer => ({ id: row.id, name: row.original_name, size: row.size, expires_at: row.expires_at.toISOString() });
async function responseLock(db: DB, form: string, key: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [form + ":" + key]);
}
// MIME headers are client-controlled. Check the content independently, and serve every format as an attachment.
export async function validateFileContent(filename: string, ext: string) {
  const fd = await open(filename, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
    const b = buffer.subarray(0, bytesRead);
    const starts = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
    let valid = false;
    if (["jpg", "jpeg"].includes(ext)) valid = starts(0xff, 0xd8, 0xff);
    if (ext === "png") valid = starts(137, 80, 78, 71, 13, 10, 26, 10);
    if (ext === "pdf") valid = b.subarray(0, 5).toString() === "%PDF-";
    if (ext === "doc") valid = starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    if (["docx", "xlsx"].includes(ext)) valid = starts(0x50, 0x4b, 0x03, 0x04);
    if (["md", "csv", "svg"].includes(ext)) {
      const text = b.toString("utf8");
      valid = !b.includes(0) && !text.includes("\ufffd");
      if (ext === "svg") valid &&= /^(?:\s|\uFEFF)*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(text);
    }
    if (!valid) fail(400, "File content does not match its extension.");
  } finally { await fd.close(); }
}
export async function uploadFormFile(req: Request, company: any, form: any) {
  const query = new URL(req.url).searchParams;
  const key = uuid.parse(query.get("key"));
  const uploadId = uuid.parse(query.get("upload"));
  const blockId = query.get("block") ?? "";
  const name = safeName(query.get("name") ?? "");
  const def = formDefinition.parse(form.definition);
  if (company.status !== "active" || form.status !== "published") fail(409, "This form is no longer accepting responses.");
  if (!def.blocks.some(b => b.id === blockId && b.type === "file_upload")) fail(400, "File question not found");
  if (!req.body) fail(400, "Choose a file");
  const length = req.headers.get("content-length");
  if (!validFormFile(name, 1)) fail(400, "Use JPEG, JPG, PNG, SVG, PDF, MD, DOC, DOCX, XLSX, or CSV.");
  if (length && (!Number.isSafeInteger(Number(length)) || Number(length) < 1 || Number(length) > MAX_FORM_FILE_BYTES)) fail(413, "Maximum file size is 5 MB.");
  const previous = (await pool.query("SELECT f.* FROM form_files f JOIN form_responses r ON r.id=f.response_id WHERE f.id=$1 AND f.form_id=$2 AND r.session_key=$3 AND f.block_id=$4", [uploadId, form.id, key, blockId])).rows[0];
  if (previous) {
    if (previous.deleted_at || previous.expires_at <= new Date()) fail(410, "This file has expired. Please upload it again.");
    return metadata(previous);
  }
  const completed = (await pool.query("SELECT 1 FROM form_responses WHERE form_id=$1 AND session_key=$2 AND status='completed'", [form.id, key])).rowCount;
  if (completed) fail(409, "This response has already been submitted.");
  await rateLimit("form-upload:global", 5000);
  await rateLimit("form-upload:" + form.id + ":" + key, 100);
  if (active.uploads >= 4) fail(503, "The upload server is busy. Please try again shortly.");
  active.uploads++;
  scheduleFormFileCleanup();
  const storageName = randomUUID();
  const destination = formFilePath(storageName);
  const temp = destination + ".part";
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.signal.addEventListener("abort", abort, { once: true });
  if (req.signal.aborted) abort();
  const timeout = setTimeout(abort, 120000);
  let size = 0, saved = false;
  try {
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const disk = await statfs(path.dirname(destination));
    if (disk.bavail * disk.bsize < MAX_FORM_FILE_BYTES + 64 * 1024 * 1024) fail(507, "File storage is full. Please try again later.");
    const limiter = new Transform({ transform(chunk: Buffer, _, done) {
      size += chunk.length;
      done(size > MAX_FORM_FILE_BYTES ? new HttpError(413, "Maximum file size is 5 MB.") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(req.body as any), limiter, createWriteStream(temp, { flags: "wx", mode: 0o600 }), { signal: controller.signal });
    if (!size) fail(400, "The file is empty.");
    await validateFileContent(temp, fileExtension(name));
    await rename(temp, destination);
    const result = await transaction(async db => {
      // Same ordering as form submission and settings changes prevents races and deadlocks.
      const c = (await db.query("SELECT status FROM companies WHERE id=$1 FOR UPDATE", [company.id])).rows[0];
      const f = (await db.query("SELECT * FROM forms WHERE company_id=$1 AND id=$2", [company.id, form.id])).rows[0];
      if (c?.status !== "active" || f?.status !== "published") fail(409, "This form is no longer accepting responses.");
      if (!formDefinition.parse(f.definition).blocks.some(b => b.id === blockId && b.type === "file_upload")) fail(409, "This file question was removed. Reload the form.");
      await responseLock(db, form.id, key);
      let response = (await db.query("SELECT id,status FROM form_responses WHERE form_id=$1 AND session_key=$2 FOR UPDATE", [form.id, key])).rows[0];
      if (response?.status === "completed") fail(409, "This response has already been submitted.");
      if (!response) response = (await db.query("INSERT INTO form_responses(company_id,form_id,session_key,form_version,position) VALUES($1,$2,$3,$4,$5) ON CONFLICT(form_id,session_key) DO UPDATE SET updated_at=form_responses.updated_at RETURNING id,status", [company.id, form.id, key, f.version, blockId])).rows[0];
      if (response.status === "completed") fail(409, "This response has already been submitted.");
      const replay = (await db.query("SELECT * FROM form_files WHERE id=$1", [uploadId])).rows[0];
      if (replay) {
        if (replay.response_id !== response.id || replay.block_id !== blockId) fail(409, "Upload ID already used");
        if (replay.deleted_at || replay.expires_at <= new Date()) fail(410, "This file has expired. Please upload it again.");
        return { file: metadata(replay), stored: false };
      }
      const stored = (await db.query("INSERT INTO form_files(id,company_id,form_id,response_id,block_id,original_name,storage_name,extension,size) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [uploadId, company.id, form.id, response.id, blockId, name, storageName, fileExtension(name), size])).rows[0];
      const file = metadata(stored);
      const answer = { type: "file_upload", title: def.blocks.find(b => b.id === blockId)!.title, value: uploadId, text: name, file };
      await db.query("UPDATE form_responses SET answers=answers || $1::jsonb,position=$2,updated_at=now() WHERE id=$3", [JSON.stringify({ [blockId]: answer }), blockId, response.id]);
      return { file, stored: true };
    });
    saved = result.stored;
    return result.file;
  } catch (error) {
    if (controller.signal.aborted) fail(408, "Upload was cancelled or timed out. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", abort);
    active.uploads--;
    await unlink(temp).catch(() => {});
    if (!saved) await unlink(destination).catch(() => {});
  }
}
// Resolve metadata from the database, never from the respondent's filename/size fields.
export async function resolveFileAnswers(db: DB, formId: string, key: string, answers: Record<string, StoredAnswer>) {
  for (const [blockId, answer] of Object.entries(answers)) {
    if (answer.type !== "file_upload") continue;
    const file = (await db.query("SELECT f.* FROM form_files f JOIN form_responses r ON r.id=f.response_id WHERE f.id=$1 AND f.form_id=$2 AND r.session_key=$3 AND f.block_id=$4", [answer.value, formId, key, blockId])).rows[0];
    if (!file || file.deleted_at || file.expires_at <= new Date()) fail(400, "Please upload this file again. Its storage period may have ended.", { block: blockId });
    answers[blockId] = { ...answer, text: file.original_name, file: metadata(file) };
  }
}
export async function downloadFormFile(req: Request, cid: string, formId: string, id: string) {
  const file = (await pool.query("SELECT * FROM form_files WHERE company_id=$1 AND form_id=$2 AND id=$3", [cid, formId, uuid.parse(id)])).rows[0];
  if (!file) fail(404, "File not found");
  if (file.deleted_at || file.expires_at <= new Date()) fail(410, `This file expired after ${FORM_FILE_RETENTION_DAYS} days. Text answers remain saved.`);
  const filename = formFilePath(file.storage_name);
  await stat(filename).catch(() => fail(404, "File is no longer available"));
  const stream = createReadStream(filename);
  const abort = () => stream.destroy();
  req.signal.addEventListener("abort", abort, { once: true });
  stream.once("close", () => req.signal.removeEventListener("abort", abort));
  return new Response(Readable.toWeb(stream) as ReadableStream, { headers: {
    "Content-Type": "application/octet-stream", "Content-Length": String(file.size),
    "Content-Disposition": `attachment; filename="file.${file.extension}"; filename*=UTF-8''${encodeURIComponent(file.original_name).replace(/'/g, "%27")}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
  } });
}
export async function downloadFormZip(req: Request, cid: string, form: any) {
  if (active.downloads >= 2) fail(503, "The download server is busy. Please try again shortly.");
  const params = [cid, form.id];
  const predicate = "f.company_id=$1 AND f.form_id=$2 AND r.answers->f.block_id->>'value'=f.id::text AND f.deleted_at IS NULL AND f.expires_at>now()";
  if (!(await pool.query(`SELECT 1 FROM form_files f JOIN form_responses r ON r.id=f.response_id WHERE ${predicate} LIMIT 1`, params)).rowCount) fail(404, "This form has no uploaded files yet.");
  if (active.downloads >= 2) fail(503, "The download server is busy. Please try again shortly.");
  active.downloads++;
  const archive = archiver("zip", { store: true, highWaterMark: 64 * 1024 });
  let source: Readable | undefined;
  let released = false;
  const release = () => { if (!released) { released = true; active.downloads--; } req.signal.removeEventListener("abort", abort); };
  const abort = () => { source?.destroy(); archive.abort(); archive.destroy(Error("Download cancelled")); release(); };
  req.signal.addEventListener("abort", abort, { once: true });
  archive.once("close", () => { source?.destroy(); release(); });
  archive.once("end", release);
  archive.on("error", () => { source?.destroy(); release(); });
  archive.on("warning", error => archive.destroy(error));
  const web = Readable.toWeb(archive) as ReadableStream;
  // Keyset pagination and one input stream at a time bound memory and open descriptors.
  void (async () => {
    try {
      let cursor = "00000000-0000-0000-0000-000000000000";
      while (!archive.destroyed) {
        const rows = (await pool.query(`SELECT f.* FROM form_files f JOIN form_responses r ON r.id=f.response_id WHERE ${predicate} AND f.id>$3 ORDER BY f.id LIMIT 100`, [...params, cursor])).rows;
        if (!rows.length) break;
        for (const file of rows) {
          if (archive.destroyed) return;
          source = createReadStream(formFilePath(file.storage_name));
          source.on("error", error => archive.destroy(error));
          const entry = once(archive, "entry");
          archive.append(source, { name: `${file.response_id}/${file.block_id}/${file.id}-${file.original_name}`, date: file.created_at });
          await entry;
          cursor = file.id;
        }
      }
      if (!archive.destroyed) await archive.finalize();
    } catch (error) { archive.destroy(error as Error); }
  })();
  if (req.signal.aborted) abort();
  return new Response(web, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${form.slug}-files.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function removeResponseFiles(cid: string, formId: string, responseId: string) {
  const files = (await pool.query("SELECT storage_name FROM form_files WHERE company_id=$1 AND form_id=$2 AND response_id=$3", [cid, formId, responseId])).rows;
  const removed = await pool.query("DELETE FROM form_responses WHERE company_id=$1 AND form_id=$2 AND id=$3", [cid, formId, responseId]);
  if (!removed.rowCount) fail(404, "Response not found");
  await Promise.all(files.map(f => unlink(formFilePath(f.storage_name)).catch(() => {})));
}
