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
import { Check, CalendarDays, Eye, EyeOff } from "lucide-react";
import LatticeLoader from "./reactbits/LatticeLoader";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
export { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter };
export function Providers({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider locale="en-US">{children}</HeroUIProvider>;
}
export function Loading({ label = "Loading" }: { label?: string }) {
  return <LatticeLoader label={label} showTimer={false} color="#0369a1" />;
}
export function permissionLabel(value: string) {
  const [module, action] = value.split(".");
  const resource = ({ campaigns: "calendars", slots: "time slots", bookings: "bookings", forms: "forms", responses: "form responses", members: "team members", roles: "roles", branding: "branding", settings: "confirmation settings", audit: "audit log" } as Record<string, string>)[module] || module;
  const verb = ({ read: "View", invite: "Invite", create: "Create", update: "Edit", remove: "Remove", delete: "Delete", cancel: "Cancel", publish: "Publish", archive: "Archive", export: "Export" } as Record<string, string>)[action] || action;
  return `${verb} ${resource}`;
}
export function PasswordField(props: any) {
  const [visible, setVisible] = useState(false);
  return <Field {...props} type={visible ? "text" : "password"} maxLength={256} endContent={
    <button type="button" className="password-toggle" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  } />;
}
export async function api(url: string, method = "GET", data?: unknown, options?: { signal?: AbortSignal }) {
  const r = await fetch("/api/" + url, {
    method,
    signal: options?.signal,
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
  if (!r.ok) throw Error(b.error ?? "Request failed");
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
      placeholder={rest.placeholder ?? " "}
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
        ["active", "published", "open", "confirmed", "attended", "completed"].includes(value)
          ? "success"
          : ["cancelled", "inactive", "archived", "rejected"].includes(value)
            ? "danger"
            : ["pending", "partial"].includes(value) ? "warning" : "default"
      }
    >
      {(
        {
          active: "Active",
          inactive: "Inactive",
          archived: "Archived",
          published: "Published",
          draft: "Draft",
          closed: "Closed",
          open: "Open",
          cancelled: "Cancelled",
          confirmed: "Confirmed",
          attended: "Attended",
          absent: "Absent",
          pending: "Pending approval",
          rejected: "Rejected",
          partial: "Partial",
          completed: "Completed",
        } as any
      )[value] ?? value}
    </Chip>
  );
}
export function Footer({ config }: { config?: any }) {
  if (config?.mode === "hidden") return null;
  if (config?.mode === "custom")
    return config.text || config.image ? (
      <footer style={{ fontSize: config.text_size, whiteSpace: "normal", flexWrap: "wrap", textAlign: "center" }}>
        {config.text && <span>{config.text}</span>}
        {config.image && <img src={config.image} alt="" style={{ width: config.image_width, maxWidth: "100%" }} />}
      </footer>
    ) : null;
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
  text = "No records yet",
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
  return new Date(v).toLocaleString("en-GB", {
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
