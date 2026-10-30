"use client";
import { useEffect, useState } from "react";
import { Building2, Clock3, Users, ShieldCheck, Settings, LogOut, Plus, Menu, ArrowUpRight, Search, Check, X, KeyRound } from "lucide-react";
import { Slider } from "@heroui/react";
import { Footer, Button, Field, PasswordField, SelectField, api, Notice, Empty, Badge, Loading, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, dateTime } from "./ui";
import HoldButton from "./reactbits/HoldButton";
import { SuccessSettings } from "./settings";

export function PlatformDashboard({ session }: { session: any }) {
  const [tab, setTab] = useState("companies");
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<any>();
  const [tick, setTick] = useState(0);
  const [mobile, setMobile] = useState(false);
  const [links, setLinks] = useState<any[]>([]);
  const [linkCompany, setLinkCompany] = useState<any>();
  const [query, setQuery] = useState("");
  const nav = [["companies", "Companies", Building2], ["pending-companies", "Pending companies", Clock3], ["users", "User access", Users], ["audit", "Audit log", ShieldCheck], ["settings", "Platform settings", Settings]] as const;
  const title = nav.find(n => n[0] === tab)?.[1] || "Companies";
  useEffect(() => {
    let alive = true; setLoading(true); setQuery("");
    Promise.all([api("platform/overview"), tab === "settings" ? Promise.resolve([]) : api("platform/" + tab)])
      .then(([s, r]) => { if (alive) { setStats(s); setRows(r); } })
      .catch(e => { if (alive) setNotice(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, tick]);
  const open = (value: any) => { setError(""); setEdit(value); };
  async function perform(url: string, data: any, message: string) {
    if (busy) return; setBusy(true); setError("");
    try { await api(url, "POST", data); setEdit(undefined); setNotice(message); setTick(t => t + 1); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loginAs(c: any) {
    if (busy) return; setBusy(true); setNotice("");
    try { await api(`platform/companies/${c.id}/login-as`, "POST", {}); location.href = "/"; }
    catch (e) { setNotice((e as Error).message); setBusy(false); }
  }
  const filtered = rows.filter(r => (tab !== "companies" || r.status !== "pending") && [r.name, r.email, r.owner_email, r.phone, r.owner_phone, r.action].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <div className="dashboard">
    <aside className={"sidebar " + (mobile ? "visible" : "")}>
      <a className="brand" href="/"><img src="/logo-auto-audit.png" alt="Auto Audit" width="150" /></a>
      <span className="product-label">CALENDAR & BOOKING</span>
      <div className="admin-workspace"><ShieldCheck size={20} /><div><strong>Super Admin</strong><small>Company management</small></div></div>
      <div className="nav-label">ADMINISTRATION</div>
      <nav>{nav.map(([key, label, Icon]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setMobile(false); setNotice(""); }}><Icon size={19} />{label}{key === "pending-companies" && Number(stats.pending) > 0 && <span className="nav-count">{stats.pending}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><strong>{session.user.name}</strong><small>{session.user.email}</small><Button variant="light" startContent={<LogOut size={16} />} onPress={async () => { await api("auth/logout", "POST"); location.href = "/"; }}>Sign out</Button></div>
    </aside>
    <div className="dashboard-main">
      <header className="topbar"><Button isIconOnly variant="light" className="mobile-menu" aria-label="Open menu" onPress={() => setMobile(!mobile)}><Menu /></Button><div className="breadcrumb">Administration<span>/</span><strong>{title}</strong></div><Badge value="active" /></header>
      <main className="workspace">
        <Notice text={notice} />
        <div className="page-heading"><div><span className="eyebrow">COMPANY MANAGEMENT</span><h1>{title}</h1><p className="muted">{({ companies: "Manage company accounts and help teams access their workspace.", "pending-companies": "Review new registrations before granting access.", users: "Manage account access and reset passwords directly.", audit: "Review company approvals, access changes, and activity.", settings: "Manage the platform name and support contact." } as any)[tab]}</p></div>{tab === "companies" && <Button color="primary" startContent={<Plus size={18} />} onPress={() => open({ kind: "company", name: "", email: "", phone: "", password: "", confirm_password: "", status: "active", timezone: "Asia/Jakarta" })}>Create company</Button>}</div>
        {["companies", "pending-companies"].includes(tab) && <div className="stats-grid">{[["Active companies", stats.companies, Building2], ["Awaiting approval", stats.pending, Clock3], ["Inactive companies", stats.inactive, Building2], ["Company users", stats.users, Users]].map(([label, value, Icon]: any) => <div className="stat-card" key={label}><div className="row between"><span>{label}</span><Icon size={20} /></div><strong>{value ?? "—"}</strong></div>)}</div>}
        {tab !== "settings" && <div className="admin-search"><Field label={tab === "users" ? "Search users" : "Search"} value={query} onChange={setQuery} placeholder="Name, email, or phone" startContent={<Search size={17} />} /></div>}
        {loading ? <div className="card empty"><Loading label="Loading company accounts" /></div> : tab === "settings" ? <SuccessSettings cid="" platform editable /> : !filtered.length ? <div className="card"><Empty text={query ? "No matching results" : tab === "pending-companies" ? "You're all caught up" : "No records yet"}><p className="muted">{tab === "pending-companies" ? "New company registrations will appear here for review." : "Try a different search or create a company account."}</p></Empty></div> : ["companies", "pending-companies"].includes(tab) ? <div className="company-grid">{filtered.map(c => <div className="card company-card" key={c.id}>
          <div className="row between"><div className="company-monogram">{c.name[0]}</div><Badge value={c.status} /></div><h2>{c.name}</h2><p className="muted">{c.email || c.owner_email || c.contact || "No contact email"}</p><p className="muted">{c.phone || c.owner_phone || "No phone number"}</p><small className="muted">Registered {dateTime(c.created_at)}</small>
          {c.rejection_reason && <p className="rejection-reason">{c.rejection_reason}</p>}
          <div className="company-actions">{tab === "pending-companies" ? <><Button color="primary" startContent={<Check size={16} />} onPress={() => open({ ...c, kind: "review", action: "approve" })}>Approve</Button><Button color="danger" variant="flat" startContent={<X size={16} />} onPress={() => open({ ...c, kind: "review", action: "reject", reason: "" })}>Reject</Button></> : <>
            <Button variant="light" onPress={async () => { setNotice(""); try { setLinks(await api(`platform/companies/${c.id}/links`)); setLinkCompany(c); } catch (e) { setNotice((e as Error).message); } }}>Manage links</Button>
            <Button color="primary" variant="flat" startContent={<ArrowUpRight size={16} />} isDisabled={c.status !== "active" || !c.owner_id || busy} onPress={() => loginAs(c)}>Login as company</Button>
            {!c.owner_id && !["pending", "rejected"].includes(c.status) && <Button color="primary" onPress={() => open({ kind: "owner", company_id: c.id, name: c.name, email: "", phone: "", password: "", confirm_password: "" })}>Set up company owner</Button>}
            {!["pending", "rejected"].includes(c.status) && <Button variant="light" onPress={() => open({ ...c, kind: "company" })}>Edit company</Button>}
            {!["pending", "rejected"].includes(c.status) && <Button variant="light" onPress={() => open({ kind: "footer", id: c.id, name: c.name, mode: "default", text: "", image: "", image_width: 104, text_size: 12, ...c.branding?.footer })}>Footer watermark</Button>}
            {c.owner_id && <Button variant="light" startContent={<KeyRound size={16} />} onPress={() => open({ id: c.owner_id, name: c.name, email: c.owner_email, kind: "reset", password: "", confirm_password: "" })}>Reset password</Button>}
          </>}</div>
        </div>)}</div> : <div className="card table-scroll"><table><thead><tr>{(tab === "audit" ? ["Time", "Activity", "By", "Company"] : ["User", "Role", "Status", "Actions"]).map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{filtered.map(r => <tr key={r.id}>{tab === "audit" ? <><td>{dateTime(r.created_at)}</td><td>{r.action}</td><td>{r.actor || "System"}</td><td>{r.company || "Platform"}</td></> : <><td><strong>{r.name}</strong><small>{r.email}</small>{r.phone && <small>{r.phone}</small>}</td><td>{r.super_admin ? "Super Admin" : "Company user"}</td><td><Badge value={r.registration_status !== "approved" ? r.registration_status : r.active ? "active" : "inactive"} /></td><td><div className="row wrap"><Button size="sm" variant="flat" onPress={() => open({ ...r, kind: "reset", password: "", confirm_password: "" })}>Reset password</Button>{r.id !== session.user.id && <Button size="sm" variant="light" onPress={() => open({ ...r, kind: "status" })}>{r.active ? "Disable" : "Enable"}</Button>}</div></td></>}</tr>)}</tbody></table></div>}
      </main><div className="dashboard-footer">Auto Audit Calendar <span>Company administration</span></div>
    </div>
    <Modal isOpen={!!linkCompany} onClose={() => { if (!busy) setLinkCompany(undefined); }} scrollBehavior="inside" size="xl"><ModalContent>
      <ModalHeader>Manage links · {linkCompany?.name}</ModalHeader>
      <ModalBody><Notice text={error} /><p className="muted">Changing a link makes the previous URL unavailable. Share the updated link with customers.</p>
        {!links.length && <Empty text="No calendars or forms yet" />}
        {links.map((link, index) => <div key={link.id} className="card"><strong>{link.title}</strong><p className="muted">{link.kind === "calendar" ? "Calendar" : "Form"}</p><Field label="Link slug" value={link.slug} onChange={(slug: string) => setLinks(rows => rows.map((row, i) => i === index ? { ...row, slug } : row))} /><Button color="primary" isDisabled={busy} onPress={async () => { setBusy(true); setError(""); try { await api(`platform/companies/${linkCompany.id}/links`, "POST", link); setNotice("Link updated."); setLinkCompany(undefined); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Save link</Button></div>)}
      </ModalBody><ModalFooter><Button variant="light" onPress={() => setLinkCompany(undefined)}>Close</Button></ModalFooter>
    </ModalContent></Modal>
    <Modal isOpen={!!edit} onClose={() => { if (!busy) setEdit(undefined); }} isDismissable={!busy} scrollBehavior="inside" size="xl"><ModalContent>{edit && <form onSubmit={e => {
      e.preventDefault();
      if (edit.kind === "reset") { perform("platform/user/" + edit.id, { action: "reset", password: edit.password, confirm_password: edit.confirm_password }, "Password reset. Existing sessions and activation links have been revoked."); }
      else if (edit.kind === "status") { perform("platform/user/" + edit.id, { action: edit.active ? "disable" : "enable" }, "User access updated."); }
      else if (edit.kind === "review") { perform(`platform/companies/${edit.id}/review`, { action: edit.action, reason: edit.reason }, "Company approved. The owner can now sign in."); }
      else if (edit.kind === "footer") { perform(`platform/companies/${edit.id}/footer`, { mode: edit.mode, text: edit.text, image: edit.image, image_width: edit.image_width, text_size: edit.text_size }, "Footer watermark updated."); }
      else if (edit.kind === "owner") { perform(`platform/companies/${edit.company_id}/owner`, edit, "Company Owner created. Login as company is now available."); }
      else { perform("platform/companies" + (edit.id ? "/" + edit.id : ""), edit, edit.id ? "Company updated." : "Company account created. The owner can sign in now."); }
    }}>
      <ModalHeader>{edit.kind === "reset" ? "Reset password" : edit.kind === "review" ? `${edit.action === "approve" ? "Approve" : "Reject"} company` : edit.kind === "status" ? "Update user access" : edit.kind === "footer" ? "Footer watermark" : edit.kind === "owner" ? "Set up company owner" : edit.id ? "Edit company" : "Create company"}</ModalHeader>
      <ModalBody><Notice text={error} />{edit.kind === "review" ? <><p><strong>{edit.name}</strong> · {edit.email}</p><p className="muted">{edit.action === "approve" ? "Approve this registration to allow the owner to sign in and manage their calendar." : "The owner will be unable to sign in. Hold the button below to confirm rejection."}</p>{edit.action === "reject" && <Field label="Reason (optional)" type="textarea" value={edit.reason} onChange={(v: string) => setEdit({ ...edit, reason: v })} maxLength={1000} />}</> : edit.kind === "footer" ? <>
        <p><strong>{edit.name}</strong></p>
        <p className="muted">Shown at the bottom of this company's booking pages, confirmations, and forms.</p>
        <SelectField label="Footer" value={edit.mode} onChange={(v: string) => v && setEdit({ ...edit, mode: v })} options={[{ value: "default", label: "Supported by Auto Audit" }, { value: "hidden", label: "No footer" }, { value: "custom", label: "Custom text and image" }]} />
        {edit.mode === "custom" && <>
          <Field label="Text" value={edit.text} onChange={(v: string) => setEdit({ ...edit, text: v })} maxLength={80} placeholder="e.g. Powered by Kopi Senja" />
          <Slider label="Text size (px)" size="sm" minValue={9} maxValue={24} step={1} value={edit.text_size} onChange={v => setEdit({ ...edit, text_size: Number(v) })} />
          <label className="upload-label">Image (PNG, JPEG, WebP, up to 2 MB)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
              const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
              try { const fd = new FormData(); fd.set("file", file); const r = await api(`platform/companies/${edit.id}/footer-image`, "POST", fd); setEdit((x: any) => ({ ...x, image: r.url })); setError(""); }
              catch (err) { setError((err as Error).message); }
            }} />
          </label>
          {edit.image && <><Slider label="Image width (px)" size="sm" minValue={24} maxValue={320} step={4} value={edit.image_width} onChange={v => setEdit({ ...edit, image_width: Number(v) })} /><Button size="sm" variant="light" color="danger" onPress={() => setEdit({ ...edit, image: "" })}>Remove image</Button></>}
        </>}
        <div className="footer-preview"><span className="eyebrow">PREVIEW</span>{edit.mode === "hidden" || (edit.mode === "custom" && !edit.text && !edit.image) ? <p className="muted">No footer is shown.</p> : <Footer config={edit} />}</div>
      </> : edit.kind === "status" ? <p>{edit.active ? "Disable" : "Enable"} access for {edit.email}?</p> : <>
        {edit.kind !== "reset" && <Field label={edit.kind === "owner" ? "Owner name" : "Company or brand name"} value={edit.name} onChange={(v: string) => setEdit({ ...edit, name: v })} minLength={2} maxLength={150} required />}
        {edit.kind === "reset" && <><p><strong>{edit.name}</strong><br />{edit.email}</p><p className="muted">Set a new password directly. Share it privately with the account owner.</p></>}
        {(edit.kind === "reset" || !edit.id) && <>
          {edit.kind !== "reset" && <><Field label="Owner email address" type="email" value={edit.email} onChange={(v: string) => setEdit({ ...edit, email: v })} required /><Field label="Contact person's phone number" type="tel" value={edit.phone} onChange={(v: string) => setEdit({ ...edit, phone: v })} required /></>}
          <PasswordField label="New password" value={edit.password} onChange={(v: string) => setEdit({ ...edit, password: v })} minLength={8} required autoComplete="new-password" description="At least 8 characters. Simple passwords are allowed." />
          <PasswordField label="Confirm password" value={edit.confirm_password} onChange={(v: string) => setEdit({ ...edit, confirm_password: v })} required autoComplete="new-password" isInvalid={!!edit.confirm_password && edit.password !== edit.confirm_password} errorMessage="Passwords do not match." />
        </>}
        {edit.kind === "company" && edit.id && <><Field label="Booking link slug" value={edit.slug} onChange={(v: string) => setEdit({ ...edit, slug: v })} required /><Field label="Company contact" value={edit.contact} onChange={(v: string) => setEdit({ ...edit, contact: v })} /><Field label="Time zone" value={edit.timezone} onChange={(v: string) => setEdit({ ...edit, timezone: v })} required /><SelectField label="Status" value={edit.status} onChange={(v: string) => setEdit({ ...edit, status: v })} options={["active", "inactive", "archived"]} /></>}
      </>}</ModalBody>
      <ModalFooter><Button variant="light" isDisabled={busy} onPress={() => setEdit(undefined)}>Cancel</Button>{edit.kind === "review" && edit.action === "reject" ? <HoldButton disabled={busy} holdTime={900} wave={false} glow={false} fillColor="#b91c1c" backgroundColor="#fee2e2" textColor="#991b1b" doneLabel="Submitting" onHold={() => perform(`platform/companies/${edit.id}/review`, { action: "reject", reason: edit.reason }, "Company registration rejected.")}>Hold to reject</HoldButton> : <Button color="primary" type="submit" isLoading={busy}>{edit.kind === "reset" ? "Reset password" : edit.kind === "review" ? "Approve company" : "Save"}</Button>}</ModalFooter>
    </form>}</ModalContent></Modal>
  </div>;
}
