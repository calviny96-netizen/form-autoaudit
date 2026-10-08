"use client";
import {
  HeroUIProvider,
  Button,
  Input,
  Textarea,
  Select,
  SelectItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Chip,
} from "@heroui/react";
import { Check, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
export { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter };
export function Providers({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider locale="id-ID">{children}</HeroUIProvider>;
}
export async function api(url: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/" + url, {
    method,
    headers:
      data instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      data === undefined
        ? undefined
        : data instanceof FormData
          ? data
          : JSON.stringify(data),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "Permintaan gagal");
  return b;
}
export function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  ...rest
}: any) {
  return type === "textarea" ? (
    <Textarea
      label={label}
      labelPlacement="outside"
      variant="bordered"
      value={value ?? ""}
      onValueChange={onChange}
      isRequired={required}
      {...rest}
    />
  ) : (
    <Input
      label={label}
      labelPlacement="outside"
      variant="bordered"
      type={type}
      value={String(value ?? "")}
      onValueChange={onChange}
      isRequired={required}
      {...rest}
    />
  );
}
export function SelectField({ label, value, onChange, options }: any) {
  return (
    <Select
      label={label}
      labelPlacement="outside"
      variant="bordered"
      selectedKeys={value ? [String(value)] : []}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o: any) => (
        <SelectItem key={typeof o === "string" ? o : o.value}>
          {typeof o === "string" ? o : o.label}
        </SelectItem>
      ))}
    </Select>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <Chip
      size="sm"
      variant="flat"
      color={
        ["active", "published", "open", "confirmed", "attended"].includes(value)
          ? "success"
          : ["cancelled", "inactive", "archived"].includes(value)
            ? "danger"
            : "default"
      }
    >
      {(
        {
          active: "Aktif",
          inactive: "Nonaktif",
          archived: "Diarsipkan",
          published: "Published",
          draft: "Draft",
          closed: "Ditutup",
          open: "Terbuka",
          cancelled: "Dibatalkan",
          confirmed: "Terkonfirmasi",
          attended: "Hadir",
          absent: "Tidak hadir",
        } as any
      )[value] ?? value}
    </Chip>
  );
}
export function Footer() {
  return (
    <footer>
      <span>supported by Auto Audit</span>
      <img
        src="/logo-auto-audit.png"
        alt="Auto Audit"
        width="104"
        height="42"
      />
    </footer>
  );
}
export function Empty({
  text = "Belum ada data",
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <MotionIcon />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
export function Notice({ text }: { text: string }) {
  return text ? (
    <div className="notice" role="status">
      {text}
    </div>
  ) : null;
}
export function dateTime(v: string, tz = "Asia/Jakarta") {
  return new Date(v).toLocaleString("id-ID", {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
}
const Lottie = dynamic(
  () =>
    import("@lottiefiles/dotlottie-react").then((m) => {
      m.setWasmUrl("/dotlottie-player.wasm");
      return m.DotLottieReact;
    }),
  { ssr: false },
);
export function MotionIcon({ success = false }: { success?: boolean }) {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotion(!m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);
  return (
    <div className={"motion-icon " + (success ? "success-icon" : "")}>
      <span>{success ? <Check size={32} /> : <CalendarDays size={32} />}</span>
      {motion && (
        <Lottie
          src="/pulse.json"
          autoplay
          loop
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
