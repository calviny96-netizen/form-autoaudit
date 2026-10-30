"use client";
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { api, Field, SelectField, Notice, Footer } from "./ui";
export const defaultSuccess = {
  title: "Your booking is confirmed!",
  message: "Your time is reserved. Keep this confirmation for your records.",
  label: "Contact organizer on WhatsApp",
  mode: "template",
  url: "",
  phone: "",
  template:
    "Hello, I'm {name}. I booked {calendar} on {date} at {time} {timezone}. My booking code is {booking_code}.",
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
        label="Confirmation title"
        value={v.title}
        onChange={(s: string) => set("title", s)}
      />
      <Field
        label="Button label"
        value={v.label}
        onChange={(s: string) => set("label", s)}
      />
      <div className="span-2">
        <Field
          label="Message"
          type="textarea"
          value={v.message}
          onChange={(s: string) => set("message", s)}
        />
      </div>
      <SelectField
        label="WhatsApp mode"
        value={v.mode}
        onChange={(s: string) => set("mode", s)}
        options={[
          { value: "template", label: "Phone number + template" },
          { value: "direct", label: "Direct link" },
        ]}
      />
      {v.mode === "direct" ? (
        <Field
          label="WhatsApp URL"
          value={v.url}
          onChange={(s: string) => set("url", s)}
          placeholder="https://wa.me/628…"
        />
      ) : (
        <Field
          label="Organizer phone number"
          type="tel"
          value={v.phone}
          onChange={(s: string) => set("phone", s)}
          placeholder="628…"
        />
      )}
      <div className="span-2">
        <Field
          label="Message template"
          type="textarea"
          value={v.template}
          onChange={(s: string) => set("template", s)}
          description="Variables: {name}, {booking_code}, {company}, {calendar}, {date}, {time}, {timezone}"
        />
      </div>
      <div className="span-2">
        <Field
          label="Additional instructions"
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
                  "Invitations are shared manually. Email delivery is not configured.",
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
                  label="Platform name"
                  value={v.name}
                  onChange={(s: string) => setV({ ...v, name: s })}
                />
                <Field
                  label="Support email"
                  type="email"
                  value={v.support_email}
                  onChange={(s: string) => setV({ ...v, support_email: s })}
                />
                <Field
                  label="Logo upload limit (MB, up to 2)"
                  type="number"
                  value={v.upload_max_mb}
                  onChange={(s: string) =>
                    setV({ ...v, upload_max_mb: Number(s) })
                  }
                />
                <Field
                  label="Email configuration notes"
                  type="textarea"
                  value={v.email_note}
                  onChange={(s: string) => setV({ ...v, email_note: s })}
                />
                <p className="muted">
                  Share activation links privately with users. Automatic email delivery is not configured.
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
                    setNotice("Settings saved.");
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                Save settings
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
              <h2>Company identity</h2>
              <label className="upload-label">
                Company logo (PNG, JPEG, WebP, up to 2 MB)
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
                      setNotice("Logo updated.");
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                />
              </label>
              <Field
                label="Primary color"
                type="color"
                value={v.primary}
                onChange={(s: string) => setV({ ...v, primary: s })}
                description="Use a color with at least 4.5:1 contrast against white text."
              />
              <Field
                label="Accent color"
                type="color"
                value={v.accent}
                onChange={(s: string) => setV({ ...v, accent: s })}
              />
              <SelectField
                label="Background preset"
                value={v.background}
                onChange={(s: string) => setV({ ...v, background: s })}
                options={["#F5FAFF", "#FFFFFF", "#F0F9FF"]}
              />
              <Field
                label="Page heading"
                value={v.heading}
                onChange={(s: string) => setV({ ...v, heading: s })}
              />
              <Field
                label="Introduction"
                type="textarea"
                value={v.intro}
                onChange={(s: string) => setV({ ...v, intro: s })}
              />
              <div className="row">
                <Button
                  variant="light"
                  onPress={() => setV({ ...defaults, logo: v.logo, footer: v.footer })}
                >
                  Reset to defaults
                </Button>
                <Button
                  color="primary"
                  onPress={async () => {
                    try {
                      await api(`companies/${cid}/branding`, "POST", v);
                      setNotice("Branding saved.");
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  Save branding
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
            <span className="eyebrow">LIVE PREVIEW</span>
            {v.logo && <img src={v.logo} alt={name} className="preview-logo" />}
            <strong>{name}</strong>
            <h2>{v.heading || "Make time for your next appointment."}</h2>
            <p>
              {v.intro || "Choose a time that works and enter your details."}
            </p>
            <Button style={{ background: v.primary, color: "white" }}>
              Choose a time
            </Button>
            <Footer config={v.footer} />
          </div>
        </div>
      )}
    </>
  );
}
