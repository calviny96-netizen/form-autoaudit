"use client";
import { useEffect, useRef } from "react";
import { Button } from "@heroui/react";
import { Check, Upload } from "lucide-react";
import { FORM_FILE_ACCEPT, FORM_FILE_EXTENSIONS, fileAnswerSchema } from "@/lib/form-files-shared";
import type { FormStrings } from "@/lib/forms";

export function UploadField({ id, value, t, upload, embedded, onSelect, onCancel }: {
  id: string; value: unknown; t: FormStrings; upload?: { name: string; percent: number };
  embedded: boolean; onSelect: (file: File) => void; onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const answer = fileAnswerSchema.safeParse(value);
  return <div className="runner-upload">
    <input ref={input} type="file" accept={FORM_FILE_ACCEPT} aria-labelledby={`q-${id}`} disabled={!!upload || embedded}
      className="runner-file-input" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onSelect(file); }} />
    <Button type="button" variant="bordered" color="primary" startContent={<Upload size={18} />} isDisabled={!!upload || embedded} onPress={() => input.current?.click()}>{t.fileChoose}</Button>
    <p className="runner-hint">{FORM_FILE_EXTENSIONS.join(", ").toUpperCase()} · Max. 5 MB</p>
    {embedded && <p className="runner-hint">{t.filePreview}</p>}
    {upload ? <div role="status" aria-live="polite">
      <p className="runner-file-name">{upload.name}</p>
      <p>{upload.percent < 100 ? `${t.fileUploading} ${upload.percent}%` : t.fileProcessing}</p>
      <progress aria-label={t.fileUploading} value={upload.percent} max={100} />
      <Button size="sm" type="button" variant="light" onPress={onCancel}>{t.fileCancel}</Button>
    </div> : answer.success && <div className="runner-file-saved" role="status"><Check size={18} /><span>{t.fileUploaded}: <strong>{answer.data.name}</strong> ({(answer.data.size / 1024).toFixed(1)} KB)</span></div>}
  </div>;
}

// beforeunload covers refresh, closing the tab and document navigation. A temporary history
// entry also catches Back inside the Next router before it can unmount the uploading form.
export function useUploadLeaveGuard(busy: boolean, message: string, cancel: () => void) {
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    if (!busy) return;
    const marker = crypto.randomUUID();
    const previous = history.state;
    history.pushState({ ...previous, formUploadGuard: marker }, "", location.href);
    let leaving = false, returning = false;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const back = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      if (returning) { returning = false; return; }
      if (window.confirm(message)) {
        leaving = true;
        cancelRef.current();
        history.back();
      } else { returning = true; history.forward(); }
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as HTMLElement)?.closest("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopImmediatePropagation(); }
      else { leaving = true; cancelRef.current(); }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("popstate", back, true);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("popstate", back, true);
      document.removeEventListener("click", click, true);
      if (!leaving && history.state?.formUploadGuard === marker) history.back();
    };
  }, [busy, message]);
}
