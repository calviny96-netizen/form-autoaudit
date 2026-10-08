"use client";
import { useState, useEffect } from "react";
import { Button, Checkbox, Tabs, Tab } from "@heroui/react";
import { DateTime } from "luxon";
import { Field, SelectField, api, Notice, Badge, Empty, dateTime } from "./ui";
import { ExtraFields } from "./public";
import { SuccessFields, defaultSuccess } from "./settings";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  CalendarDays,
} from "lucide-react";
export function CampaignEditor({
  cid,
  campaign,
  onClose,
  can,
}: {
  cid: string;
  campaign: any;
  onClose: () => void;
  can: (p: string) => boolean;
}) {
  const [v, setV] = useState<any>({
    title: "",
    slug: "",
    description: "",
    position: "",
    location: "",
    timezone: "Asia/Jakarta",
    opens_at: null,
    closes_at: null,
    status: "draft",
    fields: [],
    success: null,
    ...campaign,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("desktop");
  const [answers, setAnswers] = useState({});
  const set = (key: string, value: any) => setV({ ...v, [key]: value });
  const updateField = (i: number, key: string, value: any) =>
    set(
      "fields",
      v.fields.map((f: any, n: number) =>
        n === i ? { ...f, [key]: value } : f,
      ),
    );
  const local = (s: string) =>
    s
      ? DateTime.fromISO(s).setZone(v.timezone).toFormat("yyyy-MM-dd'T'HH:mm")
      : "";
  return (
    <>
      <Button
        variant="light"
        startContent={<ArrowLeft size={17} />}
        onPress={onClose}
      >
        Kembali ke gelombang
      </Button>
      <div className="page-heading">
        <div>
          <h1>{campaign.id ? "Edit gelombang" : "Gelombang baru"}</h1>
          <p className="muted">
            Konfigurasi pendaftaran dan pengalaman peserta.
          </p>
        </div>
        <Button
          color="primary"
          isLoading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await api(
                `companies/${cid}/campaigns` +
                  (campaign.id ? "/" + campaign.id : ""),
                "POST",
                v,
              );
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Simpan gelombang
        </Button>
      </div>
      <Notice text={error} />
      <Tabs aria-label="Pengaturan gelombang">
        <Tab key="details" title="Informasi">
          <div className="card form-grid">
            <Field
              label="Judul gelombang"
              value={v.title}
              onChange={(s: string) => set("title", s)}
              required
            />
            <Field
              label="Slug tautan"
              value={v.slug}
              onChange={(s: string) => set("slug", s)}
              required
            />
            <div className="span-2">
              <Field
                label="Deskripsi & instruksi interview"
                type="textarea"
                value={v.description}
                onChange={(s: string) => set("description", s)}
              />
            </div>
            <Field
              label="Posisi / divisi"
              value={v.position}
              onChange={(s: string) => set("position", s)}
            />
            <Field
              label="Lokasi / pertemuan online"
              value={v.location}
              onChange={(s: string) => set("location", s)}
            />
            <Field
              label="Zona waktu"
              value={v.timezone}
              onChange={(s: string) => set("timezone", s)}
            />
            <SelectField
              label="Status"
              value={v.status}
              onChange={(s: string) => set("status", s)}
              options={[
                "draft",
                ...(can("campaigns.publish") ? ["published", "closed"] : []),
                ...(can("campaigns.archive") ? ["archived"] : []),
              ]}
            />
            <Field
              label="Pendaftaran dibuka (zona waktu gelombang)"
              type="datetime-local"
              value={local(v.opens_at)}
              onChange={(s: string) =>
                set(
                  "opens_at",
                  s ? DateTime.fromISO(s, { zone: v.timezone }).toISO() : null,
                )
              }
            />
            <Field
              label="Pendaftaran ditutup (zona waktu gelombang)"
              type="datetime-local"
              value={local(v.closes_at)}
              onChange={(s: string) =>
                set(
                  "closes_at",
                  s ? DateTime.fromISO(s, { zone: v.timezone }).toISO() : null,
                )
              }
            />
          </div>
        </Tab>
        <Tab key="form" title="Form builder">
          <div className="editor-grid">
            <div>
              <div className="card">
                <h3>Field inti</h3>
                <p className="muted">
                  Nama lengkap, email, nomor WhatsApp, dan persetujuan data
                  selalu tersedia.
                </p>
              </div>
              {v.fields.map((f: any, i: number) => (
                <div className="card field-editor" key={f.id}>
                  <div className="row between">
                    <strong>Pertanyaan {i + 1}</strong>
                    <div className="row">
                      <Button
                        isIconOnly
                        size="sm"
                        aria-label="Naikkan pertanyaan"
                        isDisabled={i === 0}
                        onPress={() => {
                          const a = [...v.fields];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          set("fields", a);
                        }}
                      >
                        <ArrowUp size={16} />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        aria-label="Turunkan pertanyaan"
                        isDisabled={i === v.fields.length - 1}
                        onPress={() => {
                          const a = [...v.fields];
                          [a[i + 1], a[i]] = [a[i], a[i + 1]];
                          set("fields", a);
                        }}
                      >
                        <ArrowDown size={16} />
                      </Button>
                      <Button
                        isIconOnly
                        size="sm"
                        color="danger"
                        variant="light"
                        aria-label="Hapus pertanyaan"
                        onPress={() =>
                          set(
                            "fields",
                            v.fields.filter((_: any, n: number) => n !== i),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  <Field
                    label="Label pertanyaan"
                    value={f.label}
                    onChange={(s: string) => updateField(i, "label", s)}
                  />
                  <SelectField
                    label="Jenis jawaban"
                    value={f.type}
                    onChange={(s: string) => updateField(i, "type", s)}
                    options={[
                      "text",
                      "textarea",
                      "email",
                      "tel",
                      "number",
                      "select",
                      "radio",
                      "checkbox",
                      "date",
                    ]}
                  />
                  <Field
                    label="Placeholder"
                    value={f.placeholder}
                    onChange={(s: string) => updateField(i, "placeholder", s)}
                  />
                  <Field
                    label="Bantuan pengisian"
                    value={f.help}
                    onChange={(s: string) => updateField(i, "help", s)}
                  />
                  {["select", "radio"].includes(f.type) && (
                    <Field
                      label="Pilihan (satu per baris)"
                      type="textarea"
                      value={f.options.join("\n")}
                      onChange={(s: string) =>
                        updateField(i, "options", s.split("\n"))
                      }
                    />
                  )}
                  <div className="form-grid">
                    <Field
                      label={
                        f.type === "number"
                          ? "Nilai minimum"
                          : "Panjang minimum"
                      }
                      type="number"
                      value={f.min ?? ""}
                      onChange={(s: string) =>
                        updateField(i, "min", s === "" ? undefined : Number(s))
                      }
                    />
                    <Field
                      label={
                        f.type === "number"
                          ? "Nilai maksimum"
                          : "Panjang maksimum"
                      }
                      type="number"
                      value={f.max ?? ""}
                      onChange={(s: string) =>
                        updateField(i, "max", s === "" ? undefined : Number(s))
                      }
                    />
                  </div>
                  <Checkbox
                    isSelected={f.required}
                    onValueChange={(s) => updateField(i, "required", s)}
                  >
                    Wajib diisi
                  </Checkbox>
                </div>
              ))}
              <Button
                variant="bordered"
                startContent={<Plus size={17} />}
                onPress={() =>
                  set("fields", [
                    ...v.fields,
                    {
                      id: crypto.randomUUID(),
                      label: "Pertanyaan tambahan",
                      type: "text",
                      placeholder: "",
                      help: "",
                      required: false,
                      options: [],
                    },
                  ])
                }
              >
                Tambah pertanyaan
              </Button>
            </div>
            <div>
              <div className="row between">
                <h3>Preview formulir</h3>
                <SelectField
                  label="Ukuran"
                  value={preview}
                  onChange={setPreview}
                  options={["desktop", "mobile"]}
                />
              </div>
              <div
                className={
                  "card form-preview " +
                  (preview === "mobile" ? "mobile-preview" : "")
                }
              >
                <Field label="Nama lengkap" required />
                <Field label="Email" type="email" required />
                <Field label="Nomor WhatsApp" type="tel" required />
                <ExtraFields
                  fields={v.fields}
                  answers={answers}
                  setAnswers={setAnswers}
                />
                <Checkbox>Persetujuan penggunaan data</Checkbox>
              </div>
            </div>
          </div>
        </Tab>
        <Tab key="success" title="Halaman sukses">
          <div className="card">
            <Checkbox
              isSelected={v.success !== null}
              onValueChange={(enabled) =>
                set("success", enabled ? defaultSuccess : null)
              }
            >
              Gunakan pengaturan khusus gelombang ini
            </Checkbox>
            <p className="muted">
              Jika tidak diaktifkan, pengaturan company berlaku.
            </p>
            {v.success && (
              <SuccessFields
                value={v.success}
                onChange={(s: any) => set("success", s)}
              />
            )}
          </div>
        </Tab>
      </Tabs>
    </>
  );
}
export function SlotManager({
  cid,
  campaign,
  onClose,
  can,
}: {
  cid: string;
  campaign: any;
  onClose: () => void;
  can: (p: string) => boolean;
}) {
  const [slots, setSlots] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<any>();
  const [range, setRange] = useState({
    from: "",
    to: "",
    start: "09:00",
    end: "17:00",
    interval: 60,
    capacity: 10,
  });
  const [preview, setPreview] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api(`companies/${cid}/slots?campaign=${campaign.id}`)
      .then(setSlots)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const iso = (date: string, time: string) =>
    DateTime.fromISO(date + "T" + time, { zone: campaign.timezone }).toISO();
  const local = (v: string) =>
    DateTime.fromISO(v)
      .setZone(campaign.timezone)
      .toFormat("yyyy-MM-dd'T'HH:mm");
  function generate() {
    setError("");
    const a = [];
    let d = DateTime.fromISO(range.from, { zone: campaign.timezone });
    const end = DateTime.fromISO(range.to, { zone: campaign.timezone });
    if (
      !d.isValid ||
      !end.isValid ||
      end < d ||
      end.diff(d, "days").days > 90 ||
      range.interval < 5 ||
      range.interval > 720 ||
      range.capacity < 1
    ) {
      setError(
        "Periksa tanggal (maksimal 90 hari), interval 5–720 menit, dan kuota.",
      );
      return;
    }
    while (d <= end) {
      let start = DateTime.fromISO(d.toISODate() + "T" + range.start, {
        zone: campaign.timezone,
      });
      const stop = DateTime.fromISO(d.toISODate() + "T" + range.end, {
        zone: campaign.timezone,
      });
      while (start.plus({ minutes: range.interval }) <= stop) {
        a.push({
          starts_at: start.toISO(),
          ends_at: start.plus({ minutes: range.interval }).toISO(),
          capacity: range.capacity,
          status: "open",
          note: "",
        });
        start = start.plus({ minutes: range.interval });
        if (a.length > 500) {
          setError("Maksimal 500 slot per pembuatan.");
          return;
        }
      }
      d = d.plus({ days: 1 });
    }
    setPreview(a);
    if (!a.length) setError("Tidak ada slot dalam rentang waktu ini.");
  }
  async function save(data: any, id?: string) {
    setBusy(true);
    try {
      await api(`companies/${cid}/slots` + (id ? "/" + id : ""), "POST", {
        campaign_id: campaign.id,
        ...(id ? data : { slots: data }),
      });
      setPreview([]);
      setEdit(undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="light"
        startContent={<ArrowLeft size={16} />}
        onPress={onClose}
      >
        Kembali ke gelombang
      </Button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">JADWAL INTERVIEW</span>
          <h1>{campaign.title}</h1>
          <p className="muted">
            Zona waktu {campaign.timezone} · Kuota dapat berbeda di setiap sesi.
          </p>
        </div>
        {can("slots.create") && (
          <Button
            color="primary"
            startContent={<Plus size={17} />}
            onPress={() =>
              setEdit({
                starts_at: "",
                ends_at: "",
                capacity: 10,
                status: "open",
                note: "",
              })
            }
          >
            Tambah slot
          </Button>
        )}
      </div>
      <Notice text={error} />
      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mulai</th>
                <th>Selesai</th>
                <th>Kuota</th>
                <th>Terisi</th>
                <th>Tersisa</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id}>
                  <td>{dateTime(s.starts_at, campaign.timezone)}</td>
                  <td>{dateTime(s.ends_at, campaign.timezone)}</td>
                  <td>{s.capacity}</td>
                  <td>{s.booked}</td>
                  <td>{s.remaining}</td>
                  <td>
                    <Badge value={s.status} />
                  </td>
                  <td>
                    {can("slots.update") && (
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setEdit(s)}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!slots.length && <Empty text="Belum ada jadwal interview" />}
      </div>
      {edit && (
        <div className="card">
          <h2>{edit.id ? "Edit slot" : "Slot baru"}</h2>
          <div className="form-grid">
            <Field
              label="Mulai"
              type="datetime-local"
              value={edit.starts_at ? local(edit.starts_at) : ""}
              onChange={(s: string) =>
                setEdit({
                  ...edit,
                  starts_at: DateTime.fromISO(s, {
                    zone: campaign.timezone,
                  }).toISO(),
                })
              }
            />
            <Field
              label="Selesai"
              type="datetime-local"
              value={edit.ends_at ? local(edit.ends_at) : ""}
              onChange={(s: string) =>
                setEdit({
                  ...edit,
                  ends_at: DateTime.fromISO(s, {
                    zone: campaign.timezone,
                  }).toISO(),
                })
              }
            />
            <Field
              label="Kuota"
              type="number"
              min={1}
              value={edit.capacity}
              onChange={(s: string) =>
                setEdit({ ...edit, capacity: Number(s) })
              }
            />
            <SelectField
              label="Status"
              value={edit.status}
              onChange={(s: string) => setEdit({ ...edit, status: s })}
              options={[
                "open",
                "closed",
                ...(can("slots.cancel") ? ["cancelled"] : []),
              ]}
            />
            <Field
              label="Catatan"
              value={edit.note}
              onChange={(s: string) => setEdit({ ...edit, note: s })}
            />
          </div>
          <div className="form-actions">
            <Button variant="light" onPress={() => setEdit(undefined)}>
              Batal
            </Button>
            <Button
              color="primary"
              isLoading={busy}
              onPress={() => save(edit.id ? edit : [edit], edit.id)}
            >
              Simpan slot
            </Button>
          </div>
        </div>
      )}
      {can("slots.create") && (
        <div className="card">
          <h2>Buat jadwal sekaligus</h2>
          <p className="muted">Periksa preview sebelum menyimpan semua sesi.</p>
          <div className="form-grid three">
            {[
              ["from", "Tanggal awal", "date"],
              ["to", "Tanggal akhir", "date"],
              ["start", "Jam mulai", "time"],
              ["end", "Jam selesai", "time"],
              ["interval", "Interval (menit)", "number"],
              ["capacity", "Kuota per sesi", "number"],
            ].map(([key, label, type]) => (
              <Field
                key={key}
                label={label}
                type={type}
                value={(range as any)[key]}
                onChange={(s: string) => {
                  setRange({
                    ...range,
                    [key]: type === "number" ? Number(s) : s,
                  });
                  setPreview([]);
                }}
              />
            ))}
          </div>
          <Button variant="bordered" onPress={generate}>
            Preview jadwal
          </Button>
          {!!preview.length && (
            <>
              <h3>{preview.length} sesi akan dibuat</h3>
              <div className="preview-slots">
                {preview.map((s, i) => (
                  <div key={i}>
                    {dateTime(s.starts_at, campaign.timezone)} –{" "}
                    {new Date(s.ends_at).toLocaleTimeString("id-ID", {
                      timeZone: campaign.timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {s.capacity} kursi
                  </div>
                ))}
              </div>
              <Button
                color="primary"
                isLoading={busy}
                onPress={() => save(preview)}
              >
                Simpan {preview.length} slot
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
