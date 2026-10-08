"use client";
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { api, Field, SelectField, Notice, Footer } from "./ui";
export const defaultSuccess = {
  title: "Selamat, pendaftaran Anda berhasil!",
  message: "Silakan hubungi panitia untuk langkah berikutnya.",
  label: "Hubungi Panitia via WhatsApp",
  mode: "template",
  url: "",
  phone: "",
  template:
    "Halo Panitia, saya {nama}. Saya mendaftar {gelombang} pada {tanggal}, {jam} {zona_waktu}. Kode booking {kode_booking}.",
  instructions: "",
};
export function SuccessFields({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: any) => void;
}) {
  const v = { ...defaultSuccess, ...value };
  const set = (key: string, s: any) => onChange({ ...v, [key]: s });
  return (
    <div className="form-grid">
      <Field
        label="Judul sukses"
        value={v.title}
        onChange={(s: string) => set("title", s)}
      />
      <Field
        label="Label tombol"
        value={v.label}
        onChange={(s: string) => set("label", s)}
      />
      <div className="span-2">
        <Field
          label="Pesan"
          type="textarea"
          value={v.message}
          onChange={(s: string) => set("message", s)}
        />
      </div>
      <SelectField
        label="Mode WhatsApp"
        value={v.mode}
        onChange={(s: string) => set("mode", s)}
        options={[
          { value: "template", label: "Nomor + template" },
          { value: "direct", label: "Link langsung" },
        ]}
      />
      {v.mode === "direct" ? (
        <Field
          label="URL WhatsApp"
          value={v.url}
          onChange={(s: string) => set("url", s)}
          placeholder="https://wa.me/628…"
        />
      ) : (
        <Field
          label="Nomor panitia"
          type="tel"
          value={v.phone}
          onChange={(s: string) => set("phone", s)}
          placeholder="628…"
        />
      )}
      <div className="span-2">
        <Field
          label="Template pesan"
          type="textarea"
          value={v.template}
          onChange={(s: string) => set("template", s)}
          description="Variabel: {nama}, {kode_booking}, {company}, {gelombang}, {tanggal}, {jam}, {zona_waktu}"
        />
      </div>
      <div className="span-2">
        <Field
          label="Instruksi tambahan"
          type="textarea"
          value={v.instructions}
          onChange={(s: string) => set("instructions", s)}
        />
      </div>
    </div>
  );
}
export function SuccessSettings({
  cid,
  platform,
  editable,
}: {
  cid: string;
  platform: boolean;
  editable: boolean;
}) {
  const [v, setV] = useState<any>();
  const [notice, setNotice] = useState("");
  const base = platform ? "platform/settings" : `companies/${cid}/settings`;
  useEffect(() => {
    api(base)
      .then((x) =>
        setV(
          platform
            ? {
                name: "Auto Audit",
                support_email: "",
                email_note:
                  "Undangan dibagikan manual; pengiriman email belum dikonfigurasi.",
                upload_max_mb: 2,
                ...x,
              }
            : { ...defaultSuccess, ...x },
        ),
      )
      .catch((e) => setNotice(e.message));
  }, [base]);
  return (
    <div className="card">
      <Notice text={notice} />
      {v && (
        <>
          <fieldset disabled={!editable}>
            {platform ? (
              <div className="form-grid">
                <Field
                  label="Nama platform"
                  value={v.name}
                  onChange={(s: string) => setV({ ...v, name: s })}
                />
                <Field
                  label="Email dukungan"
                  type="email"
                  value={v.support_email}
                  onChange={(s: string) => setV({ ...v, support_email: s })}
                />
                <Field
                  label="Batas upload logo (MB, maks. 2)"
                  type="number"
                  value={v.upload_max_mb}
                  onChange={(s: string) =>
                    setV({ ...v, upload_max_mb: Number(s) })
                  }
                />
                <Field
                  label="Catatan konfigurasi email"
                  type="textarea"
                  value={v.email_note}
                  onChange={(s: string) => setV({ ...v, email_note: s })}
                />
                <p className="muted">
                  Aktivasi memakai tautan sekali pakai yang dibagikan pengelola.
                  Tidak ada email otomatis.
                </p>
              </div>
            ) : (
              <SuccessFields value={v} onChange={setV} />
            )}
          </fieldset>
          {editable && (
            <div className="form-actions">
              <Button
                color="primary"
                onPress={async () => {
                  try {
                    await api(base, "POST", v);
                    setNotice("Pengaturan disimpan.");
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                Simpan pengaturan
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
const defaults = {
  primary: "#0369A1",
  accent: "#7DD3FC",
  background: "#F5FAFF",
  heading: "",
  intro: "",
};
export function BrandingSettings({
  cid,
  editable,
}: {
  cid: string;
  editable: boolean;
}) {
  const [v, setV] = useState<any>();
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("Company");
  useEffect(() => {
    api(`companies/${cid}/branding`).then((b) => setV({ ...defaults, ...b }));
    api(`companies/${cid}`).then((c) => setName(c.name));
  }, [cid]);
  return (
    <>
      <Notice text={notice} />
      {v && (
        <div className="editor-grid">
          <div className="card">
            <fieldset disabled={!editable} className="stack">
              <h2>Identitas company</h2>
              <label className="upload-label">
                Logo company (PNG, JPEG, WebP, maks. 2 MB)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    try {
                      const fd = new FormData();
                      fd.set("file", e.target.files[0]);
                      const r = await api(`companies/${cid}/logo`, "POST", fd);
                      setV({ ...v, logo: r.url });
                      setNotice("Logo berhasil diperbarui.");
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                />
              </label>
              <Field
                label="Warna utama"
                type="color"
                value={v.primary}
                onChange={(s: string) => setV({ ...v, primary: s })}
                description="Teks putih harus memiliki kontras minimal 4.5:1."
              />
              <Field
                label="Warna aksen"
                type="color"
                value={v.accent}
                onChange={(s: string) => setV({ ...v, accent: s })}
              />
              <SelectField
                label="Preset latar"
                value={v.background}
                onChange={(s: string) => setV({ ...v, background: s })}
                options={["#F5FAFF", "#FFFFFF", "#F0F9FF"]}
              />
              <Field
                label="Judul halaman"
                value={v.heading}
                onChange={(s: string) => setV({ ...v, heading: s })}
              />
              <Field
                label="Teks pengantar"
                type="textarea"
                value={v.intro}
                onChange={(s: string) => setV({ ...v, intro: s })}
              />
              <div className="row">
                <Button
                  variant="light"
                  onPress={() => setV({ ...defaults, logo: v.logo })}
                >
                  Reset default
                </Button>
                <Button
                  color="primary"
                  onPress={async () => {
                    try {
                      await api(`companies/${cid}/branding`, "POST", v);
                      setNotice("Branding berhasil disimpan.");
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  Simpan branding
                </Button>
              </div>
            </fieldset>
          </div>
          <div
            className="card branding-preview"
            style={{
              background: v.background,
              borderTop: "5px solid " + v.accent,
            }}
          >
            <span className="eyebrow">PREVIEW LANGSUNG</span>
            {v.logo && <img src={v.logo} alt={name} className="preview-logo" />}
            <strong>{name}</strong>
            <h2>{v.heading || "Interview berikutnya dimulai di sini."}</h2>
            <p>
              {v.intro || "Pilih jadwal yang sesuai dan lengkapi data Anda."}
            </p>
            <Button style={{ background: v.primary, color: "white" }}>
              Pilih jadwal
            </Button>
            <Footer />
          </div>
        </div>
      )}
    </>
  );
}
