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
} from "lucide-react";
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
import { CampaignEditor, SlotManager } from "./editors";
import { SuccessSettings, BrandingSettings } from "./settings";
const companyDefault = {
  name: "",
  slug: "",
  contact: "",
  timezone: "Asia/Jakarta",
  status: "active",
};
export function Dashboard({ session }: { session: any }) {
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
        ["overview", "Ringkasan", LayoutDashboard],
        ["companies", "Companies", Building2],
        ["users", "Pengguna platform", Users],
        ["health", "Status layanan", Activity],
        ["audit", "Audit log", ShieldCheck],
        ["settings", "Pengaturan platform", Settings],
      ]
    : [
        ["overview", "Ringkasan", LayoutDashboard],
        ["campaigns", "Gelombang interview", CalendarDays],
        ["bookings", "Peserta", Users],
        ["members", "Anggota company", Users],
        ["roles", "Role & izin", ShieldCheck],
        ["branding", "Branding", Palette],
        ["settings", "Halaman sukses", Settings],
        ["audit", "Audit log", Activity],
      ].filter(([key]) => key === "overview" || can(key + ".read"));
  const title =
    (nav.find(([key]) => key === tab)?.[1] as string) ?? "Ruang kerja";
  async function save(url: string, data: any) {
    setBusy(true);
    try {
      const result = await api(url, "POST", data);
      setEdit(undefined);
      if (result.link) setLink(result.link);
      setNotice("Perubahan berhasil disimpan.");
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
  };
  return (
    <div className="dashboard">
      <aside className={"sidebar " + (mobile ? "visible" : "")}>
        <a className="brand" href="/">
          <img src="/logo-auto-audit.png" alt="Auto Audit" width="150" />
        </a>
        <span className="product-label">INTERVIEW SCHEDULER</span>
        <div className="workspace-select">
          <SelectField
            label="Ruang kerja aktif"
            value={platform ? "platform" : cid}
            onChange={(v: string) => switchCompany(v === "platform" ? "" : v)}
            options={[
              ...(session.user.super_admin
                ? [{ value: "platform", label: "Pengelola platform" }]
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
                {platform ? "Super Admin" : (company?.name ?? "Anggota")}
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
            Keluar
          </Button>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="topbar">
          <Button
            isIconOnly
            variant="light"
            className="mobile-menu"
            aria-label="Buka menu"
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
              {new Date().toLocaleDateString("id-ID", {
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
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {platform ? "PENGELOLA PLATFORM" : "RUANG KERJA COMPANY"}
                  </span>
                  <h1>
                    {tab === "overview"
                      ? "Semua terjadwal, semua terkendali."
                      : title}
                  </h1>
                  <p className="muted">
                    {tab === "overview"
                      ? "Pantau aktivitas interview dan atur langkah berikutnya."
                      : (
                          {
                            companies: "Kelola company dan ruang kerja mereka.",
                            campaigns:
                              "Atur gelombang, jadwal, dan formulir pendaftaran.",
                            bookings:
                              "Temukan peserta dan kelola status interview.",
                            members:
                              "Kelola siapa saja yang dapat mengakses company.",
                            roles: "Berikan akses sesuai tanggung jawab.",
                            audit:
                              "Riwayat aktivitas dan perubahan yang tercatat.",
                            health: "Kondisi layanan aplikasi saat ini.",
                            branding:
                              "Identitas company pada halaman pendaftaran.",
                            settings:
                              "Atur pengalaman setelah pendaftaran berhasil.",
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
                    Company baru
                  </Button>
                )}
                {tab === "campaigns" && can("campaigns.create") && (
                  <Button
                    color="primary"
                    startContent={<Plus size={18} />}
                    onPress={() => setCampaign({})}
                  >
                    Gelombang baru
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
                      {tab === "roles" ? "Role baru" : "Undang pengguna"}
                    </Button>
                  )}
              </div>
              {loading ? (
                <div className="card empty">Memuat data…</div>
              ) : tab === "overview" ? (
                <>
                  <div className="stats-grid">
                    {[
                      [
                        platform ? "Company aktif" : "Gelombang aktif",
                        platform ? stats.companies : stats.campaigns,
                        Building2,
                      ],
                      [
                        platform ? "Gelombang aktif" : "Total jadwal",
                        platform ? stats.campaigns : stats.slots,
                        CalendarDays,
                      ],
                      ["Peserta terdaftar", stats.bookings, Users],
                      [
                        platform ? "Total jadwal" : "Total kapasitas",
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
                          Seluruh {platform ? "platform" : "company"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="overview-band">
                    <div>
                      <span className="eyebrow">
                        RUANG UNTUK KESEMPATAN BARU
                      </span>
                      <h2>
                        {platform
                          ? "Satu platform, banyak tim."
                          : "Siapkan interview berikutnya."}
                      </h2>
                      <p>
                        {platform
                          ? "Setiap company punya jadwal, tim, dan identitasnya sendiri."
                          : "Mulai dari gelombang, atur sesi, lalu bagikan tautan pendaftaran."}
                      </p>
                      <Button
                        color="primary"
                        variant="flat"
                        onPress={() =>
                          setTab(platform ? "companies" : "campaigns")
                        }
                      >
                        {platform ? "Kelola companies" : "Kelola gelombang"}
                      </Button>
                    </div>
                    <CalendarDays className="band-icon" size={98} />
                  </div>
                  <div className="card">
                    <div className="section-title">
                      <h2>
                        {platform ? "Company terbaru" : "Gelombang interview"}
                      </h2>
                      <Button
                        variant="light"
                        onPress={() =>
                          setTab(platform ? "companies" : "campaigns")
                        }
                      >
                        Lihat semua
                      </Button>
                    </div>
                    {!rows.length ? (
                      <Empty
                        text={
                          platform
                            ? "Mulai dengan company pertama"
                            : "Belum ada gelombang interview"
                        }
                      >
                        <p className="muted">
                          {platform
                            ? "Buat company, kemudian undang Owner untuk mulai mengelola jadwal."
                            : "Buat gelombang baru untuk membuka pendaftaran peserta."}
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
                                  {r.bookings} peserta ·{" "}
                                  {r.slots ?? r.campaigns}{" "}
                                  {platform ? "jadwal" : "sesi"}
                                </small>
                              </div>
                            </div>
                            <div className="row">
                              <Badge value={r.status} />
                              <Button
                                isIconOnly
                                aria-label="Buka"
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
                          <small>Gelombang</small>
                        </div>
                        <div>
                          <b>{c.bookings}</b>
                          <small>Peserta</small>
                        </div>
                        <div>
                          <b>{c.capacity}</b>
                          <small>Kapasitas</small>
                        </div>
                      </div>
                      <div className="row">
                        <Button
                          color="primary"
                          variant="flat"
                          onPress={() => switchCompany(c.id)}
                        >
                          Buka company
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
                  {!rows.length && <Empty text="Belum ada company" />}
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
                        {p.description || "Deskripsi belum ditambahkan."}
                      </p>
                      <p className="muted">
                        {p.slots} sesi · {p.bookings} peserta · {p.timezone}
                      </p>
                      <div className="row wrap">
                        <Button
                          color="primary"
                          variant="flat"
                          onPress={() => setSlotCampaign(p)}
                        >
                          Kelola jadwal
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
                          aria-label="Salin link pendaftaran"
                          variant="light"
                          onPress={async () => {
                            await navigator.clipboard.writeText(
                              `${location.origin}/b/${company.slug}/${p.slug}`,
                            );
                            setNotice("Link pendaftaran disalin.");
                          }}
                        >
                          <Copy size={17} />
                        </Button>
                        <Button
                          as="a"
                          href={`/b/${company.slug}/${p.slug}`}
                          target="_blank"
                          isIconOnly
                          aria-label="Buka halaman publik"
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
                                title: p.title + " (salinan)",
                                slug: p.slug + "-salinan",
                                status: "draft",
                              })
                            }
                          >
                            Salin konfigurasi
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!rows.length && <Empty text="Belum ada gelombang" />}
                </div>
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
                        ? "Layanan siap digunakan"
                        : "Memeriksa layanan"}
                    </h2>
                  </div>
                  <p>Server aplikasi dan koneksi PostgreSQL merespons.</p>
                  <p className="muted">
                    Diperiksa saat halaman dimuat. Gunakan tombol untuk
                    memeriksa kembali.
                  </p>
                  <Button color="primary" variant="flat" onPress={reload}>
                    Periksa kembali
                  </Button>
                </div>
              ) : (
                <div className="card">
                  {tab === "bookings" && (
                    <div className="section-title">
                      <Field
                        label="Cari peserta"
                        value={query}
                        onChange={setQuery}
                        placeholder="Nama, email, WhatsApp, kode"
                        startContent={<Search size={17} />}
                      />
                      {can("bookings.export") && (
                        <Button
                          as="a"
                          href={`/api/${base}/bookings?export=1&q=${encodeURIComponent(query)}`}
                          variant="bordered"
                          startContent={<Download size={17} />}
                        >
                          Ekspor CSV
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {(tab === "audit"
                            ? ["Waktu", "Aktivitas", "Oleh", "Referensi"]
                            : tab === "bookings"
                              ? [
                                  "Peserta",
                                  "Gelombang & jadwal",
                                  "Status",
                                  "Tindakan",
                                ]
                              : tab === "roles"
                                ? ["Role", "Hak akses", "Tindakan"]
                                : ["Pengguna", "Role", "Status", "Tindakan"]
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
                                <td>{r.actor ?? "Peserta / sistem"}</td>
                                <td>
                                  <small>{r.entity_id ?? "—"}</small>
                                </td>
                              </>
                            ) : tab === "bookings" ? (
                              <>
                                <td>
                                  <strong>{r.name}</strong>
                                  <small>{r.email}</small>
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
                                    Detail
                                  </Button>
                                </td>
                              </>
                            ) : tab === "roles" ? (
                              <>
                                <td>
                                  <strong>{r.name}</strong>
                                  {r.owner && <small>Pemilik company</small>}
                                </td>
                                <td>
                                  {r.owner
                                    ? "Seluruh akses"
                                    : r.permissions.length + " izin"}
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
                                      Edit izin
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
                                      Hapus
                                    </Button>
                                  )}
                                </td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <strong>{r.name}</strong>
                                  <small>{r.email}</small>
                                </td>
                                <td>
                                  {r.role_name ??
                                    (r.super_admin
                                      ? "Super Admin"
                                      : "Pengguna company")}
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
                                        Reset akses
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="light"
                                        onPress={() =>
                                          setEdit({ ...r, kind: "user-status" })
                                        }
                                      >
                                        {r.active ? "Nonaktifkan" : "Aktifkan"}
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
                  {!rows.length && <Empty text="Belum ada data" />}
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
          Auto Audit Interview Scheduler{" "}
          <span>Ruang kerja yang lebih teratur.</span>
        </div>
      </div>
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
                    : "Company baru"
                  : edit.kind === "roles"
                    ? "Role & hak akses"
                    : edit.kind === "delete-role"
                      ? "Hapus role"
                      : edit.kind === "user-status"
                        ? "Ubah status pengguna"
                        : "Akses pengguna"}
              </ModalHeader>
              <ModalBody>
                <Notice text={notice} />
                {edit.kind === "delete-role" ? (
                  <p>
                    Hapus role {edit.name}? Role yang masih digunakan anggota
                    tidak dapat dihapus.
                  </p>
                ) : edit.kind === "user-status" ? (
                  <p>
                    {edit.active ? "Nonaktifkan" : "Aktifkan"} akses {edit.name}
                    ?
                  </p>
                ) : (
                  <>
                    <Field
                      label="Nama"
                      value={edit.name}
                      onChange={(v: string) => setEdit({ ...edit, name: v })}
                      required
                    />
                    {edit.kind === "company" ? (
                      <>
                        <Field
                          label="Slug company"
                          value={edit.slug}
                          onChange={(v: string) =>
                            setEdit({ ...edit, slug: v })
                          }
                          required
                          description="Huruf kecil, angka, dan tanda hubung."
                        />
                        <Field
                          label="Kontak"
                          value={edit.contact}
                          onChange={(v: string) =>
                            setEdit({ ...edit, contact: v })
                          }
                        />
                        <Field
                          label="Zona waktu"
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
                              {p}
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
                              label="Role company"
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
                              Anggota aktif
                            </Checkbox>
                            {session.user.super_admin && edit.id && (
                              <Checkbox
                                isSelected={edit.reset ?? false}
                                onValueChange={(v) =>
                                  setEdit({ ...edit, reset: v })
                                }
                              >
                                Buat tautan reset password
                              </Checkbox>
                            )}
                            <p className="muted">
                              Untuk company baru, undang minimal satu Company
                              Owner.
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
                  Batal
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
                  Simpan
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      <Modal isOpen={!!link} onClose={() => setLink("")}>
        <ModalContent>
          <ModalHeader>Tautan aktivasi siap</ModalHeader>
          <ModalBody>
            <p>
              Bagikan secara pribadi kepada pengguna. Berlaku 24 jam dan hanya
              dapat dipakai sekali.
            </p>
            <Field label="Tautan aktivasi" value={link} readOnly />
            <Button
              color="primary"
              onPress={() => navigator.clipboard.writeText(link)}
            >
              Salin tautan
            </Button>
            <p className="muted">
              Tautan tidak dikirim otomatis melalui email.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => setLink("")}>Tutup</Button>
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
              <ModalHeader>Detail peserta</ModalHeader>
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
                <h3>Jawaban formulir · versi {detail.form_version}</h3>
                {detail.answers.map((a: any) => (
                  <div key={a.id}>
                    <strong>{a.label}</strong>
                    <p>{String(a.value)}</p>
                  </div>
                ))}
                {can("bookings.update") && detail.status !== "cancelled" && (
                  <>
                    <SelectField
                      label="Status peserta"
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
                      label="Pindahkan ke sesi"
                      value={moveTo}
                      onChange={setMoveTo}
                      options={moveSlots.map((s) => ({
                        value: s.id,
                        label:
                          dateTime(s.starts_at, detail.timezone) +
                          ` · ${s.remaining} kursi tersisa`,
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
                      Simpan pemindahan
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
                    Batalkan booking dan kembalikan kursi
                  </Button>
                )}
              </ModalBody>
              <ModalFooter>
                <Button onPress={() => setDetail(undefined)}>Tutup</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
