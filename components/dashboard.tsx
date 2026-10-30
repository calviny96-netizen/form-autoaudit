"use client";
import { useEffect, useState } from "react";
import {
  Button,
  Field,
  SelectField,
  api,
  Notice,
  Empty,
  Badge,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  dateTime,
  MotionIcon,
  Loading,
  permissionLabel,
} from "./ui";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Users,
  ShieldCheck,
  Palette,
  Settings,
  Activity,
  LogOut,
  Plus,
  ArrowUpRight,
  Search,
  Copy,
  Download,
  Menu,
  Clock3,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  Checkbox,
  Pagination,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { permissions } from "@/lib/schema";
import { PlatformDashboard } from "./platform";
import { CampaignEditor, SlotManager } from "./editors";
import { SuccessSettings, BrandingSettings } from "./settings";
import { FormsGrid, NewFormModal, FormResponses } from "./forms";
// The builder and its drag-and-drop code load only when a form is opened.
const FormBuilder = dynamic(() => import("./form-builder"), {
  ssr: false,
  loading: () => (
    <div className="studio loading">
      <Loading label="Opening form builder" />
    </div>
  ),
});
const companyDefault = {
  name: "",
  slug: "",
  contact: "",
  timezone: "Asia/Jakarta",
  status: "active",
};
export function Dashboard({ session }: { session: any }) {
  return session.user.super_admin ? <PlatformDashboard session={session} /> : <CompanyDashboard session={session} />;
}
function CompanyDashboard({ session }: { session: any }) {
  const [companies, setCompanies] = useState(session.companies);
  const [cid, setCid] = useState("");
  const [company, setCompany] = useState<any>();
  const [tab, setTab] = useState("overview");
  const [rows, setRows] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<any>();
  const [campaign, setCampaign] = useState<any>();
  const [slotCampaign, setSlotCampaign] = useState<any>();
  const [form, setForm] = useState<any>();
  const [formResponses, setFormResponses] = useState<any>();
  const [creatingForm, setCreatingForm] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [link, setLink] = useState("");
  const [detail, setDetail] = useState<any>();
  const [moveSlots, setMoveSlots] = useState<any[]>([]);
  const [moveTo, setMoveTo] = useState("");
  const platform = session.user.super_admin && !cid;
  const base = platform ? "platform" : `companies/${cid}`;
  const can = (p: string) => platform || company?.permissions?.includes(p);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    if (!session.user.super_admin && companies.length) setCid(companies[0].id);
  }, []);
  useEffect(() => {
    if (cid)
      api("companies/" + cid)
        .then(setCompany)
        .catch((e) => setNotice(e.message));
    else setCompany(undefined);
  }, [cid, tick]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRows([]);
    setPage(1);
    setNotice("");
    if (!platform && !cid) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        if (tab === "overview") {
          const s = await api(base + "/overview");
          if (alive) setStats(s);
          const r = await api(base + (platform ? "/companies" : "/campaigns"));
          if (alive) setRows(r);
        } else if (tab === "health") {
          const r = await api("health/ready");
          if (alive) setStats(r);
        } else if (["branding", "settings"].includes(tab)) {
        } else {
          const r = await api(
            base +
              "/" +
              tab +
              (tab === "bookings" ? "?q=" + encodeURIComponent(query) : ""),
          );
          if (alive) setRows(r);
        }
        if (["members", "roles"].includes(tab) && cid) {
          const r = await api(base + "/roles");
          if (alive) setRoles(r);
        }
      } catch (e) {
        if (alive) setNotice((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [cid, tab, tick, query]);
  const nav = platform
    ? [
        ["overview", "Overview", LayoutDashboard],
        ["companies", "Companies", Building2],
        ["users", "Platform users", Users],
        ["health", "Service status", Activity],
        ["audit", "Audit log", ShieldCheck],
        ["settings", "Platform settings", Settings],
      ]
    : [
        ["overview", "Overview", LayoutDashboard],
        ["campaigns", "Calendars", CalendarDays],
        ["forms", "Forms", ClipboardList],
        ["bookings", "Bookings", Users],
        ["members", "Team members", Users],
        ["roles", "Roles & permissions", ShieldCheck],
        ["branding", "Branding", Palette],
        ["settings", "Confirmation page", Settings],
        ["audit", "Audit log", Activity],
      ].filter(([key]) => key === "overview" || can(key + ".read"));
  const title =
    (nav.find(([key]) => key === tab)?.[1] as string) ?? "Workspace";
  async function save(url: string, data: any) {
    setBusy(true);
    try {
      const result = await api(url, "POST", data);
      setEdit(undefined);
      if (result.link) setLink(result.link);
      setNotice("Changes saved.");
      reload();
      if (platform) setCompanies((await api("auth/me")).companies);
      return result;
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(url: string, data: any) {
    try {
      const r = await api(url, "POST", data);
      if (r.link) setLink(r.link);
      reload();
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    }
  }
  const switchCompany = (value: string) => {
    setCid(value);
    setTab("overview");
    setCampaign(undefined);
    setSlotCampaign(undefined);
    setForm(undefined);
    setFormResponses(undefined);
  };
  return (
    <>
    <div className="dashboard" inert={!!form}>
      <aside className={"sidebar " + (mobile ? "visible" : "")}>
        <a className="brand" href="/">
          <img src="/logo-auto-audit.png" alt="Auto Audit" width="150" />
        </a>
        <span className="product-label">CALENDAR & BOOKING</span>
        <div className="workspace-select">
          <SelectField
            label="Active workspace"
            value={platform ? "platform" : cid}
            onChange={(v: string) => switchCompany(v === "platform" ? "" : v)}
            options={[
              ...(session.user.super_admin
                ? [{ value: "platform", label: "Platform administrator" }]
                : []),
              ...companies.map((c: any) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div className="nav-label">{platform ? "PLATFORM" : "COMPANY"}</div>
        <nav>
          {nav.map(([key, label, Icon]: any) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                setCampaign(undefined);
                setSlotCampaign(undefined);
                setFormResponses(undefined);
                setMobile(false);
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="row">
            <div className="avatar">{session.user.name[0]}</div>
            <div>
              <strong>{session.user.name}</strong>
              <small>
                {platform ? "Super Admin" : (company?.name ?? "Member")}
              </small>
            </div>
          </div>
          <Button
            variant="light"
            size="sm"
            startContent={<LogOut size={16} />}
            onPress={async () => {
              await api("auth/logout", "POST");
              location.href = "/";
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <div className="dashboard-main">
        {session.user.impersonator_id && <div className="impersonation-banner"><span>Viewing {company?.name || "company workspace"} as Company Owner</span><Button size="sm" variant="flat" onPress={async () => { await api("auth/stop-impersonation", "POST"); location.href = "/"; }}>Return to Super Admin</Button></div>}
        <header className="topbar">
          <Button
            isIconOnly
            variant="light"
            className="mobile-menu"
            aria-label="Open menu"
            onPress={() => setMobile(!mobile)}
          >
            <Menu />
          </Button>
          <div className="breadcrumb">
            {platform ? "Platform" : (company?.name ?? "Company")}
            <span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="row">
            <span className="today">
              {new Date().toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Jakarta",
              })}
            </span>
            <div className="avatar small">{session.user.name[0]}</div>
          </div>
        </header>
        <main className="workspace">
          <Notice text={notice} />
          {campaign ? (
            <CampaignEditor
              cid={cid}
              campaign={campaign}
              can={can}
              onClose={() => {
                setCampaign(undefined);
                reload();
              }}
            />
          ) : slotCampaign ? (
            <SlotManager
              cid={cid}
              campaign={slotCampaign}
              can={can}
              onClose={() => {
                setSlotCampaign(undefined);
                reload();
              }}
            />
          ) : formResponses ? (
            <FormResponses
              cid={cid}
              company={company}
              form={formResponses}
              can={can}
              onClose={() => {
                setFormResponses(undefined);
                reload();
              }}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {platform ? "PLATFORM ADMINISTRATION" : "COMPANY WORKSPACE"}
                  </span>
                  <h1>
                    {tab === "overview"
                      ? "Your calendar, at a glance."
                      : title}
                  </h1>
                  <p className="muted">
                    {tab === "overview"
                      ? "Keep track of bookings and plan what comes next."
                      : (
                          {
                            companies: "Manage companies and their workspaces.",
                            campaigns:
                              "Manage calendars, time slots, and booking forms.",
                            forms:
                              "Build interactive forms and review every response.",
                            bookings:
                              "Find customers and manage their bookings.",
                            members:
                              "Manage access to your company workspace.",
                            roles: "Give each team member the access they need.",
                            audit:
                              "Review recorded activity and changes.",
                            health: "Check the current service status.",
                            branding:
                              "Customize your company booking page.",
                            settings:
                              "Customize the booking confirmation experience.",
                          } as any
                        )[tab]}
                  </p>
                </div>
                {tab === "companies" && (
                  <Button
                    color="primary"
                    startContent={<Plus size={18} />}
                    onPress={() =>
                      setEdit({ ...companyDefault, kind: "company" })
                    }
                  >
                    New company
                  </Button>
                )}
                {tab === "campaigns" && can("campaigns.create") && (
                  <Button
                    color="primary"
                    startContent={<Plus size={18} />}
                    onPress={() => setCampaign({})}
                  >
                    New calendar
                  </Button>
                )}
                {tab === "forms" && can("forms.create") && (
                  <Button
                    color="primary"
                    startContent={<Plus size={18} />}
                    onPress={() => setCreatingForm(true)}
                  >
                    New form
                  </Button>
                )}
                {["members", "roles", "users"].includes(tab) &&
                  can(
                    tab === "users"
                      ? ""
                      : tab + "." + (tab === "roles" ? "create" : "invite"),
                  ) && (
                    <Button
                      color="primary"
                      startContent={<Plus size={18} />}
                      onPress={() =>
                        setEdit({
                          kind: tab,
                          name: "",
                          email: "",
                          permissions: [],
                          role_id: roles[0]?.id,
                          active: true,
                        })
                      }
                    >
                      {tab === "roles" ? "New role" : "Invite user"}
                    </Button>
                  )}
              </div>
              {loading ? (
                <div className="card empty"><Loading label="Loading your calendar" /></div>
              ) : tab === "overview" ? (
                <>
                  <div className="stats-grid">
                    {[
                      [
                        platform ? "Active companies" : "Published calendars",
                        platform ? stats.companies : stats.campaigns,
                        Building2,
                      ],
                      [
                        platform ? "Published calendars" : "Time slots",
                        platform ? stats.campaigns : stats.slots,
                        CalendarDays,
                      ],
                      ["Confirmed bookings", stats.bookings, Users],
                      [
                        platform ? "Time slots" : "Total capacity",
                        platform ? stats.slots : stats.capacity,
                        Clock3,
                      ],
                    ].map(([label, n, Icon]: any) => (
                      <div className="stat-card" key={label}>
                        <div className="row between">
                          <span>{label}</span>
                          <Icon size={20} />
                        </div>
                        <strong>{n ?? 0}</strong>
                        <small>
                          {platform ? "Platform total" : "Company total"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="overview-band">
                    <div>
                      <span className="eyebrow">
                        MAKE TIME FOR WHAT MATTERS
                      </span>
                      <h2>
                        {platform
                          ? "One platform. Every team."
                          : "Plan your next booking."}
                      </h2>
                      <p>
                        {platform
                          ? "Each company has its own calendar, team, and identity."
                          : "Create a calendar, add time slots, and share your booking link."}
                      </p>
                      <Button
                        color="primary"
                        variant="flat"
                        onPress={() =>
                          setTab(platform ? "companies" : "campaigns")
                        }
                      >
                        {platform ? "Manage companies" : "Manage calendars"}
                      </Button>
                    </div>
                    <CalendarDays className="band-icon" size={98} />
                  </div>
                  <div className="card">
                    <div className="section-title">
                      <h2>
                        {platform ? "Recent companies" : "Calendars"}
                      </h2>
                      <Button
                        variant="light"
                        onPress={() =>
                          setTab(platform ? "companies" : "campaigns")
                        }
                      >
                        View all
                      </Button>
                    </div>
                    {!rows.length ? (
                      <Empty
                        text={
                          platform
                            ? "Create your first company"
                            : "No calendars yet"
                        }
                      >
                        <p className="muted">
                          {platform
                            ? "Create a company and invite an owner to manage its calendar."
                            : "Create a calendar to start accepting bookings."}
                        </p>
                      </Empty>
                    ) : (
                      <div className="compact-list">
                        {rows.slice(0, 5).map((r) => (
                          <div className="row between" key={r.id}>
                            <div className="row">
                              <div className="list-icon">
                                <Building2 size={22} />
                              </div>
                              <div>
                                <strong>{r.name ?? r.title}</strong>
                                <small>
                                  {r.bookings} {Number(r.bookings) === 1 ? "booking" : "bookings"} ·{" "}
                                  {r.slots ?? r.campaigns}{" "}
                                  {platform ? "time slots" : "slots"}
                                </small>
                              </div>
                            </div>
                            <div className="row">
                              <Badge value={r.status} />
                              <Button
                                isIconOnly
                                aria-label="Open"
                                variant="light"
                                onPress={() =>
                                  platform
                                    ? switchCompany(r.id)
                                    : setSlotCampaign(r)
                                }
                              >
                                <ArrowUpRight size={18} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : tab === "companies" ? (
                <div className="company-grid">
                  {rows.map((c) => (
                    <div className="card company-card" key={c.id}>
                      <div className="row between">
                        <div className="company-monogram">{c.name[0]}</div>
                        <Badge value={c.status} />
                      </div>
                      <h2>{c.name}</h2>
                      <p className="muted">
                        /{c.slug} · {c.timezone}
                      </p>
                      <div className="company-metrics">
                        <div>
                          <b>{c.campaigns}</b>
                          <small>Calendar</small>
                        </div>
                        <div>
                          <b>{c.bookings}</b>
                          <small>Customers</small>
                        </div>
                        <div>
                          <b>{c.capacity}</b>
                          <small>Capacity</small>
                        </div>
                      </div>
                      <div className="row">
                        <Button
                          color="primary"
                          variant="flat"
                          onPress={() => switchCompany(c.id)}
                        >
                          Open company
                        </Button>
                        <Button
                          variant="light"
                          onPress={() => setEdit({ ...c, kind: "company" })}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!rows.length && <Empty text="No companies yet" />}
                </div>
              ) : tab === "campaigns" ? (
                <div className="company-grid">
                  {rows.map((p) => (
                    <div className="card campaign-card" key={p.id}>
                      <div className="row between">
                        <CalendarDays size={25} />
                        <Badge value={p.status} />
                      </div>
                      <h2>{p.title}</h2>
                      <p className="muted clamp">
                        {p.description || "No description added yet."}
                      </p>
                      <p className="muted">
                        {p.slots} {Number(p.slots) === 1 ? "slot" : "slots"} · {p.bookings} {Number(p.bookings) === 1 ? "booking" : "bookings"} · {p.timezone}
                      </p>
                      <div className="row wrap">
                        <Button
                          color="primary"
                          variant="flat"
                          onPress={() => setSlotCampaign(p)}
                        >
                          Manage time slots
                        </Button>
                        {can("campaigns.update") && (
                          <Button
                            variant="light"
                            onPress={() => setCampaign(p)}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          isIconOnly
                          aria-label="Copy booking link"
                          variant="light"
                          onPress={async () => {
                            await navigator.clipboard.writeText(
                              `${location.origin}/b/${company.slug}/${p.slug}`,
                            );
                            setNotice("Booking link copied.");
                          }}
                        >
                          <Copy size={17} />
                        </Button>
                        <Button
                          as="a"
                          href={`/b/${company.slug}/${p.slug}`}
                          target="_blank"
                          isIconOnly
                          aria-label="Open booking page"
                          variant="light"
                        >
                          <ArrowUpRight size={18} />
                        </Button>
                        {can("campaigns.create") && (
                          <Button
                            variant="light"
                            size="sm"
                            onPress={() =>
                              setCampaign({
                                ...p,
                                id: undefined,
                                title: p.title + " (copy)",
                                slug: p.slug + "-copy",
                                status: "draft",
                              })
                            }
                          >
                            Duplicate calendar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!rows.length && <Empty text="No calendars yet" />}
                </div>
              ) : tab === "forms" ? (
                <FormsGrid
                  cid={cid}
                  company={company}
                  rows={rows}
                  can={can}
                  setNotice={setNotice}
                  reload={reload}
                  onEdit={setForm}
                  onResponses={setFormResponses}
                />
              ) : tab === "branding" ? (
                <BrandingSettings cid={cid} editable={can("branding.update")} />
              ) : tab === "settings" ? (
                <SuccessSettings
                  cid={cid}
                  platform={platform}
                  editable={platform || can("settings.update")}
                />
              ) : tab === "health" ? (
                <div className="card">
                  <div className="row">
                    <CheckCircle2 color="#15803d" />
                    <h2>
                      {stats.status === "ready"
                        ? "Service is ready"
                        : "Checking service"}
                    </h2>
                  </div>
                  <p>The application and database are responding.</p>
                  <p className="muted">
                    Checked when this page loaded. Refresh to check again.
                  </p>
                  <Button color="primary" variant="flat" onPress={reload}>
                    Check again
                  </Button>
                </div>
              ) : (
                <div className="card">
                  {tab === "bookings" && (
                    <div className="section-title">
                      <Field
                        label="Search customers"
                        value={query}
                        onChange={setQuery}
                        placeholder="Name, email, phone, booking code"
                        startContent={<Search size={17} />}
                      />
                      {can("bookings.export") && (
                        <Button
                          as="a"
                          href={`/api/${base}/bookings?export=1&q=${encodeURIComponent(query)}`}
                          variant="bordered"
                          startContent={<Download size={17} />}
                        >
                          Export CSV
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {(tab === "audit"
                            ? ["Time", "Activity", "By", "Reference"]
                            : tab === "bookings"
                              ? [
                                  "Customers",
                                  "Calendar & time",
                                  "Status",
                                  "Actions",
                                ]
                              : tab === "roles"
                                ? ["Role", "Permissions", "Actions"]
                                : ["Pengguna", "Role", "Status", "Actions"]
                          ).map((x) => (
                            <th key={x}>{x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice((page - 1) * 15, page * 15).map((r) => (
                          <tr key={r.id}>
                            {tab === "audit" ? (
                              <>
                                <td>{dateTime(r.created_at)}</td>
                                <td>{r.action}</td>
                                <td>{r.actor ?? "Customer / system"}</td>
                                <td>
                                  <small>{r.entity_id ?? "—"}</small>
                                </td>
                              </>
                            ) : tab === "bookings" ? (
                              <>
                                <td>
                                  <strong>{r.name || "Unnamed customer"}</strong>
                                  <small>{r.email || "Email not provided"}</small>
                                  <small>{r.code}</small>
                                </td>
                                <td>
                                  {r.title}
                                  <small>
                                    {dateTime(r.starts_at, r.timezone)} ·{" "}
                                    {r.timezone}
                                  </small>
                                </td>
                                <td>
                                  <Badge value={r.status} />
                                </td>
                                <td>
                                  <Button
                                    size="sm"
                                    variant="light"
                                    onPress={async () => {
                                      setDetail(r);
                                      setMoveTo(r.slot_id);
                                      try {
                                        setMoveSlots(
                                          await api(
                                            base +
                                              "/slots?campaign=" +
                                              r.campaign_id,
                                          ),
                                        );
                                      } catch {
                                        setMoveSlots([]);
                                      }
                                    }}
                                  >
                                    Details
                                  </Button>
                                </td>
                              </>
                            ) : tab === "roles" ? (
                              <>
                                <td>
                                  <strong>{r.name}</strong>
                                  {r.owner && <small>Company Owner</small>}
                                </td>
                                <td>
                                  {r.owner
                                    ? "Full access"
                                    : r.permissions.length + " permissions"}
                                </td>
                                <td>
                                  {!r.owner && can("roles.update") && (
                                    <Button
                                      size="sm"
                                      variant="light"
                                      onPress={() =>
                                        setEdit({ ...r, kind: "roles" })
                                      }
                                    >
                                      Edit permissions
                                    </Button>
                                  )}
                                  {!r.owner && can("roles.delete") && (
                                    <Button
                                      size="sm"
                                      variant="light"
                                      color="danger"
                                      onPress={() =>
                                        setEdit({ ...r, kind: "delete-role" })
                                      }
                                    >
                                      Delete
                                    </Button>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <strong>{r.name || "Unnamed customer"}</strong>
                                  <small>{r.email || "Email not provided"}</small>
                                </td>
                                <td>
                                  {r.role_name ??
                                    (r.super_admin
                                      ? "Super Admin"
                                      : "Company user")}
                                </td>
                                <td>
                                  <Badge
                                    value={r.active ? "active" : "inactive"}
                                  />
                                </td>
                                <td>
                                  {tab === "members" &&
                                    can("members.update") && (
                                      <Button
                                        size="sm"
                                        variant="light"
                                        onPress={() =>
                                          setEdit({ ...r, kind: "members" })
                                        }
                                      >
                                        Edit
                                      </Button>
                                    )}
                                  {platform && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="light"
                                        onPress={() =>
                                          action("platform/user/" + r.id, {
                                            action: "reset",
                                          })
                                        }
                                      >
                                        Reset password
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="light"
                                        onPress={() =>
                                          setEdit({ ...r, kind: "user-status" })
                                        }
                                      >
                                        {r.active ? "Disable" : "Enable"}
                                      </Button>
                                    </>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!rows.length && <Empty text="No records yet" />}
                  {rows.length > 15 && (
                    <Pagination
                      total={Math.ceil(rows.length / 15)}
                      page={page}
                      onChange={setPage}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </main>
        <div className="dashboard-footer">
          Auto Audit Calendar{" "}
          <span>Keep every booking organized.</span>
        </div>
      </div>
      <NewFormModal
        cid={cid}
        company={company}
        rows={tab === "forms" ? rows : []}
        isOpen={creatingForm}
        onClose={() => setCreatingForm(false)}
        onCreated={(created) => {
          setCreatingForm(false);
          setForm(created);
        }}
      />
      <Modal
        isOpen={!!edit}
        onClose={() => setEdit(undefined)}
        size={edit?.kind === "roles" ? "3xl" : "xl"}
        scrollBehavior="inside"
      >
        <ModalContent>
          {edit && (
            <>
              <ModalHeader>
                {edit.kind === "company"
                  ? edit.id
                    ? "Edit company"
                    : "New company"
                  : edit.kind === "roles"
                    ? "Roles & permissions"
                    : edit.kind === "delete-role"
                      ? "Delete role"
                      : edit.kind === "user-status"
                        ? "Update user status"
                        : "User access"}
              </ModalHeader>
              <ModalBody>
                <Notice text={notice} />
                {edit.kind === "delete-role" ? (
                  <p>
                    Delete role {edit.name}? Roles assigned to members cannot be deleted.
                  </p>
                ) : edit.kind === "user-status" ? (
                  <p>
                    {edit.active ? "Disable" : "Enable"} access for {edit.name}
                    ?
                  </p>
                ) : (
                  <>
                    <Field
                      label="Name"
                      value={edit.name}
                      onChange={(v: string) => setEdit({ ...edit, name: v })}
                      required
                    />
                    {edit.kind === "company" ? (
                      <>
                        <Field
                          label="Company slug"
                          value={edit.slug}
                          onChange={(v: string) =>
                            setEdit({ ...edit, slug: v })
                          }
                          required
                          description="Lowercase letters, numbers, and hyphens."
                        />
                        <Field
                          label="Contact"
                          value={edit.contact}
                          onChange={(v: string) =>
                            setEdit({ ...edit, contact: v })
                          }
                        />
                        <Field
                          label="Time zone"
                          value={edit.timezone}
                          onChange={(v: string) =>
                            setEdit({ ...edit, timezone: v })
                          }
                        />
                        <SelectField
                          label="Status"
                          value={edit.status}
                          onChange={(v: string) =>
                            setEdit({ ...edit, status: v })
                          }
                          options={["active", "inactive", "archived"]}
                        />
                      </>
                    ) : edit.kind === "roles" ? (
                      <div className="permission-grid">
                        {permissions
                          .filter((p) => can(p))
                          .map((p) => (
                            <Checkbox
                              key={p}
                              isSelected={edit.permissions.includes(p)}
                              onValueChange={(v) =>
                                setEdit({
                                  ...edit,
                                  permissions: v
                                    ? [...edit.permissions, p]
                                    : edit.permissions.filter(
                                        (x: string) => x !== p,
                                      ),
                                })
                              }
                            >
                              {permissionLabel(p)}
                            </Checkbox>
                          ))}
                      </div>
                    ) : (
                      <>
                        <Field
                          label="Email"
                          type="email"
                          isDisabled={!!edit.id}
                          value={edit.email}
                          onChange={(v: string) =>
                            setEdit({ ...edit, email: v })
                          }
                        />
                        {edit.kind === "members" && (
                          <>
                            <SelectField
                              label="Company role"
                              value={edit.role_id}
                              onChange={(v: string) =>
                                setEdit({ ...edit, role_id: v })
                              }
                              options={roles.map((r) => ({
                                value: r.id,
                                label: r.name,
                              }))}
                            />
                            <Checkbox
                              isSelected={edit.active}
                              onValueChange={(v) =>
                                setEdit({ ...edit, active: v })
                              }
                            >
                              Active member
                            </Checkbox>
                            {session.user.super_admin && edit.id && (
                              <Checkbox
                                isSelected={edit.reset ?? false}
                                onValueChange={(v) =>
                                  setEdit({ ...edit, reset: v })
                                }
                              >
                                Create a password reset link
                              </Checkbox>
                            )}
                            <p className="muted">
                              Invite at least one Company Owner for a new company.
                            </p>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={() => setEdit(undefined)}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isLoading={busy}
                  onPress={async () => {
                    if (edit.kind === "delete-role") {
                      try {
                        await api(base + "/roles/" + edit.id, "DELETE");
                        setEdit(undefined);
                        reload();
                      } catch (e) {
                        setNotice((e as Error).message);
                      }
                      return;
                    }
                    if (edit.kind === "user-status") {
                      await action("platform/user/" + edit.id, {
                        action: edit.active ? "disable" : "enable",
                      });
                      setEdit(undefined);
                      return;
                    }
                    await save(
                      edit.kind === "company"
                        ? "platform/companies" + (edit.id ? "/" + edit.id : "")
                        : base +
                            "/" +
                            edit.kind +
                            (edit.id ? "/" + edit.id : ""),
                      edit,
                    );
                  }}
                >
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      <Modal isOpen={!!link} onClose={() => setLink("")}>
        <ModalContent>
          <ModalHeader>Activation link ready</ModalHeader>
          <ModalBody>
            <p>
              Share this link privately. It expires in 24 hours and can only be used once.
            </p>
            <Field label="Activation link" value={link} readOnly />
            <Button
              color="primary"
              onPress={() => navigator.clipboard.writeText(link)}
            >
              Copy link
            </Button>
            <p className="muted">
              This link is not emailed automatically.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => setLink("")}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(undefined)}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {detail && (
            <>
              <ModalHeader>Booking details</ModalHeader>
              <ModalBody>
                <Notice text={notice} />
                <h2>{detail.name}</h2>
                <p>
                  {detail.email} · {detail.phone}
                </p>
                <p>
                  {detail.code} · <Badge value={detail.status} />
                </p>
                <p>{dateTime(detail.starts_at, detail.timezone)}</p>
                <h3>Form responses · version {detail.form_version}</h3>
                {detail.answers.map((a: any) => (
                  <div key={a.id}>
                    <strong>{a.label}</strong>
                    <p>{String(a.value)}</p>
                  </div>
                ))}
                {can("bookings.update") && detail.status !== "cancelled" && (
                  <>
                    <SelectField
                      label="Booking status"
                      value={detail.status}
                      onChange={async (v: string) => {
                        if (
                          await action(base + "/bookings/" + detail.id, {
                            status: v,
                          })
                        )
                          setDetail({ ...detail, status: v });
                      }}
                      options={["confirmed", "attended", "absent"]}
                    />
                    <SelectField
                      label="Move to time slot"
                      value={moveTo}
                      onChange={setMoveTo}
                      options={moveSlots.map((s) => ({
                        value: s.id,
                        label:
                          dateTime(s.starts_at, detail.timezone) +
                          ` · ${s.remaining} places remaining`,
                      }))}
                    />
                    <Button
                      variant="bordered"
                      onPress={async () => {
                        try {
                          await api(base + "/bookings/" + detail.id, "POST", {
                            slot_id: moveTo,
                          });
                          setDetail(undefined);
                          reload();
                        } catch (e) {
                          setNotice((e as Error).message);
                        }
                      }}
                    >
                      Save new time
                    </Button>
                  </>
                )}
                {can("bookings.cancel") && detail.status !== "cancelled" && (
                  <Button
                    color="danger"
                    variant="flat"
                    onPress={async () => {
                      await action(base + "/bookings/" + detail.id, {
                        status: "cancelled",
                      });
                      setDetail(undefined);
                    }}
                  >
                    Cancel booking and release capacity
                  </Button>
                )}
              </ModalBody>
              <ModalFooter>
                <Button onPress={() => setDetail(undefined)}>Close</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
    {/* The builder covers the whole window, so the workspace behind it is taken out of reach. */}
    {form && (
      <FormBuilder
        cid={cid}
        company={company}
        form={form}
        can={can}
        onClose={() => {
          setForm(undefined);
          reload();
        }}
      />
    )}
    </>
  );
}
