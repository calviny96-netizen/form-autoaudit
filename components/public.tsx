"use client";
import { useEffect, useState } from "react";
import { Button, Checkbox, RadioGroup, Radio } from "@heroui/react";
import {
  api,
  Field,
  SelectField,
  Footer,
  Notice,
  Empty,
  dateTime,
  MotionIcon,
} from "./ui";
import {
  CalendarDays,
  MapPin,
  Clock3,
  Check,
  ArrowLeft,
  Copy,
  MessageCircle,
} from "lucide-react";
import { bookingSchema, validateAnswers } from "@/lib/schema";
import { ShineBorder } from "./shine-border";
export function ExtraFields({
  fields,
  answers,
  setAnswers,
}: {
  fields: any[];
  answers: any;
  setAnswers: (v: any) => void;
}) {
  return (
    <>
      {fields.map((f) => {
        const value = answers[f.id] ?? "";
        const change = (v: any) => setAnswers({ ...answers, [f.id]: v });
        return (
          <div key={f.id}>
            {f.type === "checkbox" ? (
              <Checkbox
                isSelected={!!value}
                onValueChange={change}
                isRequired={f.required}
              >
                {f.label}
                {f.required ? " *" : ""}
              </Checkbox>
            ) : f.type === "select" ? (
              <SelectField
                label={f.label + (f.required ? " *" : "")}
                value={value}
                onChange={change}
                options={f.options}
              />
            ) : f.type === "radio" ? (
              <RadioGroup
                label={f.label}
                value={value}
                onValueChange={change}
                isRequired={f.required}
              >
                {f.options.map((o: string) => (
                  <Radio key={o} value={o}>
                    {o}
                  </Radio>
                ))}
              </RadioGroup>
            ) : (
              <Field
                label={f.label}
                value={value}
                onChange={change}
                type={f.type}
                placeholder={f.placeholder}
                required={f.required}
                description={f.help}
                min={f.type === "number" ? f.min : undefined}
                max={f.type === "number" ? f.max : undefined}
                minLength={f.type !== "number" ? f.min : undefined}
                maxLength={f.type !== "number" ? f.max : undefined}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
export function PublicBooking({
  company,
  campaign,
}: {
  company: string;
  campaign: string;
}) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<any>({});
  const [consent, setConsent] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`public/${company}/${campaign}`)
      .then(setData)
      .catch((e) => setError(e.message));
    setKey(crypto.randomUUID());
  }, [company, campaign]);
  if (!data)
    return (
      <div className="public-state">
        <Notice text={error} />
        {!error && "Memuat jadwal…"}
        <Footer />
      </div>
    );
  const p = data.campaign,
    c = data.company,
    b = c.branding;
  const dateKey = (v: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: p.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(v));
  const days = [
    ...new Set<string>(data.slots.map((s: any) => dateKey(s.starts_at))),
  ];
  const selected = data.slots.find((s: any) => s.id === slot);
  const closed =
    p.status !== "published" ||
    (p.closes_at && new Date(p.closes_at) < new Date());
  const future = p.opens_at && new Date(p.opens_at) > new Date();
  return (
    <div
      className="public-page"
      style={
        {
          background: b.background ?? "#F5FAFF",
          "--brand": b.primary ?? "#0369A1",
        } as any
      }
    >
      <header className="public-nav">
        <a className="company-brand" href={`/b/${company}/${campaign}`}>
          {b.logo ? (
            <img src={b.logo} alt={c.name} />
          ) : (
            <div className="company-monogram">{c.name.slice(0, 1)}</div>
          )}
          <strong>{c.name}</strong>
        </a>
        <span className="muted">Pendaftaran interview</span>
      </header>
      <main className="public-container">
        <div className="public-heading">
          <span className="eyebrow">LANGKAH BARU DIMULAI DI SINI</span>
          <h1>{b.heading || p.title}</h1>
          <p>{b.intro || p.description}</p>
          <div className="row metadata">
            <span>
              <MapPin size={17} />
              {p.location || "Lokasi diinformasikan panitia"}
            </span>
            <span>
              <Clock3 size={17} />
              {p.timezone}
            </span>
          </div>
        </div>
        <div className="steps">
          {["Pilih jadwal", "Isi formulir", "Periksa & daftar"].map((v, i) => (
            <div key={v} className={step === i + 1 ? "current" : ""}>
              <span>{step > i + 1 ? <Check size={16} /> : i + 1}</span>
              {v}
            </div>
          ))}
        </div>
        <Notice text={error} />
        {closed || future ? (
          <Empty
            text={future ? "Pendaftaran belum dibuka" : "Pendaftaran ditutup"}
          >
            {future && <p>Dibuka {dateTime(p.opens_at, p.timezone)}</p>}
          </Empty>
        ) : (
          <div className="public-grid">
            <section className="card booking-card">
              {step === 1 ? (
                <>
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">01 / JADWAL</span>
                      <h2>Temukan waktu yang cocok</h2>
                      <p className="muted">
                        Pilih tanggal, lalu sesi interview Anda.
                      </p>
                    </div>
                    <CalendarDays />
                  </div>
                  {!days.length ? (
                    <Empty text="Belum ada jadwal tersedia" />
                  ) : (
                    <>
                      <h3>Tanggal interview</h3>
                      <div className="date-options">
                        {days.map((d) => (
                          <button
                            key={d}
                            className={day === d ? "selected" : ""}
                            onClick={() => {
                              setDay(d);
                              setSlot("");
                            }}
                          >
                            <span>
                              {new Date(d + "T12:00:00Z").toLocaleDateString(
                                "id-ID",
                                { weekday: "short", timeZone: "UTC" },
                              )}
                            </span>
                            <strong>{d.slice(-2)}</strong>
                            <span>
                              {new Date(d + "T12:00:00Z").toLocaleDateString(
                                "id-ID",
                                {
                                  month: "short",
                                  year: "numeric",
                                  timeZone: "UTC",
                                },
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      <h3>
                        Sesi tersedia <small>{p.timezone}</small>
                      </h3>
                      <div className="slot-options">
                        {data.slots
                          .filter((s: any) => dateKey(s.starts_at) === day)
                          .map((s: any) => (
                            <button
                              key={s.id}
                              disabled={s.remaining <= 0 || s.status !== "open"}
                              className={slot === s.id ? "selected" : ""}
                              onClick={() => setSlot(s.id)}
                            >
                              <strong>
                                {new Date(s.starts_at).toLocaleTimeString(
                                  "id-ID",
                                  {
                                    timeZone: p.timezone,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}{" "}
                                –{" "}
                                {new Date(s.ends_at).toLocaleTimeString(
                                  "id-ID",
                                  {
                                    timeZone: p.timezone,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </strong>
                              <span>
                                {s.status !== "open"
                                  ? "Ditutup"
                                  : s.remaining === 0
                                    ? "Slot penuh"
                                    : `${s.remaining} kursi tersedia`}
                              </span>
                            </button>
                          ))}
                      </div>
                      {!day && (
                        <p className="muted">
                          Pilih tanggal untuk melihat sesi.
                        </p>
                      )}
                      <div className="form-actions">
                        <span className="muted">
                          Kursi dialokasikan setelah pendaftaran berhasil.
                        </span>
                        <Button
                          color="primary"
                          isDisabled={!slot}
                          onPress={() => setStep(2)}
                        >
                          Lanjutkan
                        </Button>
                      </div>
                    </>
                  )}
                </>
              ) : step === 2 ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError("");
                    try {
                      bookingSchema.parse({
                        slot_id: slot,
                        idempotency_key: key,
                        name,
                        email,
                        phone,
                        consent,
                        answers,
                      });
                      validateAnswers(p.fields, answers);
                      setStep(3);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <span className="eyebrow">02 / DATA PESERTA</span>
                  <h2>Kenalkan diri Anda</h2>
                  <Field
                    label="Nama lengkap"
                    value={name}
                    onChange={setName}
                    required
                    autoComplete="name"
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    required
                    autoComplete="email"
                  />
                  <Field
                    label="Nomor WhatsApp"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    required
                    placeholder="08… atau 62…"
                    autoComplete="tel"
                  />
                  <ExtraFields
                    fields={p.fields}
                    answers={answers}
                    setAnswers={setAnswers}
                  />
                  <Checkbox
                    isSelected={consent}
                    onValueChange={setConsent}
                    isRequired
                  >
                    Saya menyetujui penggunaan data untuk proses interview.
                  </Checkbox>
                  <div className="form-actions">
                    <Button variant="light" onPress={() => setStep(1)}>
                      Kembali
                    </Button>
                    <Button color="primary" type="submit">
                      Periksa pendaftaran
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="eyebrow">03 / KONFIRMASI</span>
                  <h2>Sudah sesuai?</h2>
                  <dl className="summary">
                    <dt>Nama</dt>
                    <dd>{name}</dd>
                    <dt>Email</dt>
                    <dd>{email}</dd>
                    <dt>WhatsApp</dt>
                    <dd>{phone}</dd>
                    {p.fields.map((f: any) => (
                      <div key={f.id}>
                        <dt>{f.label}</dt>
                        <dd>{String(answers[f.id] ?? "—")}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="muted">
                    Pastikan data dan jadwal benar sebelum mendaftar.
                  </p>
                  <div className="form-actions">
                    <Button variant="light" onPress={() => setStep(2)}>
                      Ubah data
                    </Button>
                    <Button
                      color="primary"
                      isLoading={busy}
                      onPress={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const result = await api(
                            `public/${company}/${campaign}`,
                            "POST",
                            {
                              slot_id: slot,
                              idempotency_key: key,
                              name,
                              email,
                              phone,
                              consent,
                              answers,
                            },
                          );
                          location.href = "/success/" + result.token;
                        } catch (e) {
                          setError((e as Error).message);
                          api(`public/${company}/${campaign}`)
                            .then(setData)
                            .catch(() => {});
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Daftar Interview
                    </Button>
                  </div>
                </>
              )}
            </section>
            <aside>
              <div className="card summary-card">
                <div className="row">
                  <CalendarDays size={20} />
                  <h3>Interview Anda</h3>
                </div>
                <hr />
                <strong>{p.title}</strong>
                {p.position && <p>{p.position}</p>}
                <p className="muted">
                  {p.location || "Informasi lokasi menyusul"}
                </p>
                <div className="selected-summary">
                  {selected ? (
                    <>
                      <strong>
                        {dateTime(selected.starts_at, p.timezone)}
                      </strong>
                      <span>{p.timezone}</span>
                    </>
                  ) : (
                    <span>Jadwal belum dipilih</span>
                  )}
                </div>
                <p className="muted">
                  Satu pendaftaran untuk satu peserta. Konfirmasi dan langkah
                  selanjutnya tersedia setelah Anda mendaftar.
                </p>
              </div>
            </aside>
          </div>
        )}
        <Footer />
      </main>
    </div>
  );
}
export function SuccessPage({ token }: { token: string }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api("success/" + token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <main className="success-page">
      <div className="card success-card">
        <ShineBorder shineColor={["#7dd3fc", "#15803d"]} />
        <Notice text={error} />
        {data ? (
          <>
            <MotionIcon success />
            <span className="eyebrow">
              {data.status === "cancelled"
                ? "BOOKING DIBATALKAN"
                : "PENDAFTARAN TERSIMPAN"}
            </span>
            <h1>
              {data.status === "cancelled"
                ? "Booking ini telah dibatalkan"
                : data.config.title}
            </h1>
            <p>{data.config.message}</p>
            <div className="success-detail">
              <strong>{data.title}</strong>
              <span>
                {dateTime(data.starts_at, data.timezone)} · {data.timezone}
              </span>
              <span>{data.company}</span>
              <hr />
              <span>Kode booking</span>
              <b className="booking-code">{data.code}</b>
            </div>
            <p>{data.config.instructions}</p>
            {data.whatsapp.url && (
              <Button
                as="a"
                href={data.whatsapp.url}
                target="_blank"
                rel="noopener noreferrer"
                color="success"
                className="text-white w-full"
                startContent={<MessageCircle size={20} />}
              >
                {data.config.label}
              </Button>
            )}
            <Button
              variant="bordered"
              className="w-full"
              startContent={<Copy size={16} />}
              onPress={async () => {
                try {
                  await navigator.clipboard.writeText(
                    [
                      data.whatsapp.phone || data.whatsapp.url,
                      data.whatsapp.message,
                    ].join("\n"),
                  );
                  setCopied(true);
                } catch {
                  setError(
                    "Penyalinan tidak tersedia. Pilih dan salin teks di bawah.",
                  );
                }
              }}
            >
              {copied ? "Tersalin" : "Salin nomor dan pesan"}
            </Button>
            <details>
              <summary>Nomor dan pesan WhatsApp</summary>
              <p>
                {data.whatsapp.phone ||
                  data.whatsapp.url ||
                  "Nomor panitia belum diatur."}
              </p>
              <p className="pre-wrap">{data.whatsapp.message}</p>
            </details>
            <small className="muted">
              Simpan halaman ini. Pesan WhatsApp dikirim setelah Anda menekan
              kirim di WhatsApp.
            </small>
          </>
        ) : (
          !error && "Memuat konfirmasi…"
        )}
      </div>
      <Footer />
    </main>
  );
}
