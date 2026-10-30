"use client";
import { DuplicateSettings } from "./duplicate-settings";
import { defaultCalendarDuplicateRule, duplicateTypes } from "@/lib/duplicates";
import { useState, useEffect } from "react";
import { Button, Checkbox, Tabs, Tab } from "@heroui/react";
import { DateTime } from "luxon";
import { Field, SelectField, api, Notice, Badge, Empty, dateTime } from "./ui";
import { ExtraFields } from "./public";
import { defaultStandardFields } from "@/lib/schema";
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
    standard_fields: defaultStandardFields(),
    duplicate_rule: defaultCalendarDuplicateRule(),
    success: null,
    ...campaign,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("mobile");
  const [answers, setAnswers] = useState({});
  const set = (key: string, value: any) => setV((old: any) => {
    let duplicate_rule = old.duplicate_rule;
    if (key === "standard_fields") {
      const fields = duplicate_rule.fields.filter((field: string) => !["name", "email", "phone"].includes(field) || value[field].enabled);
      duplicate_rule = { ...duplicate_rule, fields, enabled: duplicate_rule.enabled && fields.length > 0 };
    }
    return { ...old, duplicate_rule, [key]: value };
  });
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
        Back to calendars
      </Button>
      <div className="page-heading">
        <div>
          <h1>{campaign.id ? "Edit calendar" : "New calendar"}</h1>
          <p className="muted">
            Set up your calendar and customer booking experience.
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
          Save calendar
        </Button>
      </div>
      <Notice text={error} />
      <Tabs aria-label="Calendar settings">
        <Tab key="details" title="Details">
          <div className="card form-grid">
            <Field
              label="Calendar title"
              value={v.title}
              onChange={(s: string) => set("title", s)}
              required
            />
            <p className="muted">{campaign.id ? "Your booking link stays the same when you edit the title." : "Your booking link is created automatically from the calendar title."} Contact Super Admin if you need a custom link.</p>
            <div className="span-2">
              <Field
                label="Description & booking instructions"
                type="textarea"
                value={v.description}
                onChange={(s: string) => set("description", s)}
              />
            </div>
            <Field
              label="Service or category"
              value={v.position}
              onChange={(s: string) => set("position", s)}
            />
            <Field
              label="Location or meeting link"
              value={v.location}
              onChange={(s: string) => set("location", s)}
            />
            <Field
              label="Time zone"
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
              label="Booking opens (calendar time zone)"
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
              label="Booking closes (calendar time zone)"
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
                <h3>Standard fields</h3>
                <p className="muted">
                  Choose which contact fields to show and whether they are required. Data consent is included.
                </p>
                {(["name", "email", "phone"] as const).map(key => <div className="field-editor" key={key}>
                  <strong>{{ name: "Full name", email: "Email", phone: "Phone number" }[key]}</strong>
                  <div className="row wrap">
                    <Checkbox isSelected={v.standard_fields[key].enabled} onValueChange={enabled => set("standard_fields", { ...v.standard_fields, [key]: { ...v.standard_fields[key], enabled } })}>Show field</Checkbox>
                    <Checkbox isSelected={v.standard_fields[key].required} isDisabled={!v.standard_fields[key].enabled} onValueChange={required => set("standard_fields", { ...v.standard_fields, [key]: { ...v.standard_fields[key], required } })}>Required</Checkbox>
                  </div>
                </div>)}
              </div>
              <DuplicateSettings rule={v.duplicate_rule} onChange={value => set("duplicate_rule", value)} options={[
                ...(["name", "email", "phone"] as const).filter(key => v.standard_fields[key].enabled).map(key => ({ key, label: { name: "Full name", email: "Email", phone: "Phone number" }[key] })),
                { key: "booking_date", label: "Booking date (calendar time zone)" },
                ...v.fields.filter((f: any) => duplicateTypes.includes(f.type)).map((f: any) => ({ key: "field:" + f.id, label: f.label || "Untitled question" })),
              ]} />
              {v.fields.map((f: any, i: number) => (
                <div className="card field-editor" key={f.id}>
                  <div className="row between">
                    <strong>Question {i + 1}</strong>
                    <div className="row">
                      <Button
                        isIconOnly
                        size="sm"
                        aria-label="Move question up"
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
                        aria-label="Move question down"
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
                        aria-label="Remove question"
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
                    label="Question label"
                    value={f.label}
                    onChange={(s: string) => updateField(i, "label", s)}
                  />
                  <SelectField
                    label="Answer type"
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
                    label="Help text"
                    value={f.help}
                    onChange={(s: string) => updateField(i, "help", s)}
                  />
                  {["select", "radio"].includes(f.type) && (
                    <Field
                      label="Options (one per line)"
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
                          ? "Minimum value"
                          : "Minimum length"
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
                          ? "Maximum value"
                          : "Maximum length"
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
                    Required
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
                      label: "Additional question",
                      type: "text",
                      placeholder: "",
                      help: "",
                      required: false,
                      options: [],
                    },
                  ])
                }
              >
                Add question
              </Button>
            </div>
            <div>
              <div className="row between">
                <h3>Form preview</h3>
                <SelectField
                  label="Preview size"
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
                {v.standard_fields.name.enabled && <Field label="Full name" required={v.standard_fields.name.required} />}
                {v.standard_fields.email.enabled && <Field label="Email" type="email" required={v.standard_fields.email.required} />}
                {v.standard_fields.phone.enabled && <Field label="Phone number" type="tel" required={v.standard_fields.phone.required} />}
                <ExtraFields
                  fields={v.fields}
                  answers={answers}
                  setAnswers={setAnswers}
                />
                <Checkbox>Consent to use booking details</Checkbox>
              </div>
            </div>
          </div>
        </Tab>
        <Tab key="success" title="Confirmation page">
          <div className="card">
            <Checkbox
              isSelected={v.success !== null}
              onValueChange={(enabled) =>
                set("success", enabled ? defaultSuccess : null)
              }
            >
              Use custom confirmation settings for this calendar
            </Checkbox>
            <p className="muted">
              Otherwise, the company confirmation settings apply.
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
        "Check the dates (up to 90 days), interval (5–720 minutes), and capacity.",
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
          setError("Create up to 500 time slots at once.");
          return;
        }
      }
      d = d.plus({ days: 1 });
    }
    setPreview(a);
    if (!a.length) setError("No time slots in this date range.");
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
        Back to calendars
      </Button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TIME SLOTS</span>
          <h1>{campaign.title}</h1>
          <p className="muted">
            Time zone {campaign.timezone} · Each time slot can have a different capacity.
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
            Add time slot
          </Button>
        )}
      </div>
      <Notice text={error} />
      <div className="card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Start</th>
                <th>End</th>
                <th>Capacity</th>
                <th>Booked</th>
                <th>Remaining</th>
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
        {!slots.length && <Empty text="No time slots yet" />}
      </div>
      {edit && (
        <div className="card">
          <h2>{edit.id ? "Edit time slot" : "New time slot"}</h2>
          <div className="form-grid">
            <Field
              label="Start"
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
              label="End"
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
              label="Capacity"
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
              label="Note"
              value={edit.note}
              onChange={(s: string) => setEdit({ ...edit, note: s })}
            />
          </div>
          <div className="form-actions">
            <Button variant="light" onPress={() => setEdit(undefined)}>
              Cancel
            </Button>
            <Button
              color="primary"
              isLoading={busy}
              onPress={() => save(edit.id ? edit : [edit], edit.id)}
            >
              Save time slot
            </Button>
          </div>
        </div>
      )}
      {can("slots.create") && (
        <div className="card">
          <h2>Create multiple time slots</h2>
          <p className="muted">Review the preview before saving all time slots.</p>
          <div className="form-grid three">
            {[
              ["from", "Start date", "date"],
              ["to", "End date", "date"],
              ["start", "Start time", "time"],
              ["end", "End time", "time"],
              ["interval", "Interval (minutes)", "number"],
              ["capacity", "Capacity per slot", "number"],
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
            Preview time slots
          </Button>
          {!!preview.length && (
            <>
              <h3>{preview.length} time slots will be created</h3>
              <div className="preview-slots">
                {preview.map((s, i) => (
                  <div key={i}>
                    {dateTime(s.starts_at, campaign.timezone)} –{" "}
                    {new Date(s.ends_at).toLocaleTimeString("en-GB", {
                      timeZone: campaign.timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {s.capacity} places
                  </div>
                ))}
              </div>
              <Button
                color="primary"
                isLoading={busy}
                onPress={() => save(preview)}
              >
                Save {preview.length} slot
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
