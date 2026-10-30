import { opendir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "./db";

// Preserve metadata and text answers when deleting binary attachments.
export async function cleanupFormFiles(scanOrphans = true) {
  const root = path.join(process.env.UPLOAD_DIR!, "form-files");
  const expired = (await pool.query(`SELECT f.id,f.storage_name FROM form_files f JOIN form_responses r ON r.id=f.response_id
    WHERE f.deleted_at IS NULL AND (f.expires_at<=now() OR
      (f.created_at<now()-interval '7 days' AND coalesce(r.answers->f.block_id->>'value','')<>f.id::text))
    ORDER BY f.expires_at LIMIT 500`)).rows;
  for (const file of expired) {
    try { await unlink(path.join(root, file.storage_name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await pool.query("UPDATE form_files SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL", [file.id]);
  }
  if (!scanOrphans) return;
  let directory;
  try { directory = await opendir(root); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  for await (const entry of directory) {
    if (!entry.isFile() || !/^[a-f0-9-]{36}(?:\.part)?$/.test(entry.name)) continue;
    const filename = path.join(root, entry.name);
    const info = await stat(filename).catch(() => null);
    if (!info || info.mtimeMs > Date.now() - 24 * 60 * 60 * 1000) continue;
    if (!(await pool.query("SELECT 1 FROM form_files WHERE storage_name=$1 AND deleted_at IS NULL", [entry.name])).rowCount) await unlink(filename).catch(() => {});
  }
}
const maintenance = globalThis as typeof globalThis & { formFileMaintenance?: { last: number; lastOrphanScan: number; busy: boolean; timer?: ReturnType<typeof setInterval> } };
const state = maintenance.formFileMaintenance ??= { last: 0, lastOrphanScan: 0, busy: false };
export function scheduleFormFileCleanup() {
  if (!state.timer && ["production", "development"].includes(process.env.NODE_ENV ?? "")) {
    state.timer = setInterval(scheduleFormFileCleanup, 60000);
    state.timer.unref();
  }
  if (state.busy || Date.now() - state.last < 60000) return;
  state.last = Date.now();
  state.busy = true;
  const scanOrphans = Date.now() - state.lastOrphanScan >= 86400000;
  if (scanOrphans) state.lastOrphanScan = Date.now();
  void cleanupFormFiles(scanOrphans).catch(error => console.error("Form file cleanup failed", error)).finally(() => { state.busy = false; });
}
