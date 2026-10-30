"use client";
import { useEffect, useState } from "react";
import { Clock3, Download } from "lucide-react";
import { FORM_FILE_RETENTION_DAYS, type FileAnswer } from "@/lib/form-files-shared";
import { dateTime } from "./ui";
export function fileTimeLeft(expires: string, now: number) {
  let minutes = Math.max(0, Math.ceil((new Date(expires).getTime() - now) / 60000));
  const days = Math.floor(minutes / 1440); minutes %= 1440;
  const hours = Math.floor(minutes / 60); minutes %= 60;
  return `${days} hari ${hours} jam ${minutes} menit`;
}
export function useFileClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  return now;
}
export function FileRetentionNotice({ expires, timezone, now }: { expires?: string | null; timezone?: string; now: number }) {
  const remaining = expires ? new Date(expires).getTime() - now : 0;
  return <div className={`file-retention-notice${expires && remaining < 3 * 86400000 ? " urgent" : ""}`}>
    <Clock3 size={21} aria-hidden="true" />
    <div>
      <strong>File upload otomatis dihapus setelah {FORM_FILE_RETENTION_DAYS} hari.</strong>
      {expires && <p>{remaining > 0 ? <>File terdekat akan dihapus dalam <b>{fileTimeLeft(expires, now)}</b>.</> : "Masa simpan file terdekat telah berakhir."} <span className="file-retention-date">Batas waktu: {dateTime(expires, timezone)}.</span></p>}
      <p><Download size={14} aria-hidden="true" /> Segera download file Anda sebelum masa simpan berakhir. Jawaban teks tetap tersimpan.</p>
    </div>
  </div>;
}
export function ResponseFile({ file, text, href, now }: { file: FileAnswer; text: string; href: string; now: number }) {
  const expired = file.available === false || (!!file.expires_at && new Date(file.expires_at).getTime() <= now);
  return <div className="response-file">
    {expired ? <span>{text}</span> : <a className="response-file-link" href={href}>{text}</a>}
    <small className={expired ? "file-expired" : "muted"}>{expired ? "File sudah dihapus / masa simpan berakhir" : file.expires_at ? `Sisa ${fileTimeLeft(file.expires_at, now)}` : ""}</small>
  </div>;
}
