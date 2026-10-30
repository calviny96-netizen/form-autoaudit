"use client";
import { useEffect, useState, useRef } from "react";
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
  Loading,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
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
import { bookingSchema, validateAnswers, validationMessage, standardFieldsSchema, validateStandardDetails } from "@/lib/schema";
import { ShineBorder } from "./shine-border";
import { useBookingSubmission } from "./use-booking-submission";
import { clearConfirmedAttempts } from "@/lib/booking-submission";
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
  const submission = useBookingSubmission(company, campaign);
  const [navigationPrompt, setNavigationPrompt] = useState<"edit" | "leave" | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!stepRef.current) return;
    stepRef.current.focus({ preventScroll: true });
    stepRef.current.scrollIntoView({ block: "start", behavior: "auto" });
    setError("");
  }, [step]);
  useEffect(() => {
    const payload = submission.restoredPayload;
    if (!payload) return;
    setSlot(payload.slot_id); setName(payload.name); setEmail(payload.email);
    setPhone(payload.phone); setAnswers(payload.answers); setConsent(payload.consent);
    setKey(payload.idempotency_key); setStep(3);
  }, [submission.restoredPayload]);
  useEffect(() => {
    if (submission.state.error && errorRef.current) {
      errorRef.current.focus({ preventScroll: true });
      errorRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [submission.state.error]);
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
        {!error && <Loading label="Loading time slots" />}
        {error && <Footer />}
      </div>
    );
  const standard = standardFieldsSchema.parse(data.campaign.standard_fields ?? {});
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
        <a className="company-brand" href={`/b/${company}/${campaign}`} onClick={event => {
          if (submission.shouldWarn()) { event.preventDefault(); setNavigationPrompt("leave"); }
        }}>
          {b.logo ? (
            <img src={b.logo} alt={c.name} />
          ) : (
            <div className="company-monogram">{c.name.slice(0, 1)}</div>
          )}
          <strong>{c.name}</strong>
        </a>
        <span className="muted">Online booking</span>
      </header>
      <main className="public-container">
        <div className="public-heading">
          <span className="eyebrow">A LITTLE TIME, WELL PLANNED</span>
          <h1>{b.heading || p.title}</h1>
          <p>{b.intro || p.description}</p>
          <div className="row metadata">
            <span>
              <MapPin size={17} />
              {p.location || "Location provided by the organizer"}
            </span>
            <span>
              <Clock3 size={17} />
              {p.timezone}
            </span>
          </div>
        </div>
        <div className="steps">
          {["Choose a time", "Your details", "Review & book"].map((v, i) => (
            <div key={v} aria-current={step === i + 1 ? "step" : undefined} className={step === i + 1 ? "current" : ""}>
              <span>{step > i + 1 ? <Check size={16} /> : i + 1}</span>
              {v}
            </div>
          ))}
        </div>
        {((closed || future) && submission.state.phase === "idle") && <Notice text={error} />}
        {(closed || future) && submission.state.phase === "idle" ? (
          <Empty
            text={future ? "Booking is not open yet" : "Booking is closed"}
          >
            {future && <p>Opens {dateTime(p.opens_at, p.timezone)}</p>}
          </Empty>
        ) : (
          <div className="public-grid">
            <section ref={stepRef} tabIndex={-1} className="card booking-card booking-heading" aria-label={`Booking step ${step} of 3`}>
              <Notice text={error} />
              {selected && step > 1 && <div className="booking-inline-summary"><strong>{dateTime(selected.starts_at, p.timezone)}</strong><span>{p.timezone} · {p.location || "Location details to follow"}</span></div>}
              {step === 1 ? (
                <>
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">01 / CHOOSE A TIME</span>
                      <h2>Find a time that works</h2>
                      <p className="muted">
                        Choose a date, then an available time slot.
                      </p>
                    </div>
                    <CalendarDays />
                  </div>
                  {!days.length ? (
                    <Empty text="No time slots available" />
                  ) : (
                    <>
                      <h3>Available dates</h3>
                      <div className="date-options">
                        {days.map((d) => (
                          <button
                            key={d}
                            aria-pressed={day === d}
                            className={day === d ? "selected" : ""}
                            onClick={() => {
                              setDay(d);
                              setSlot("");
                            }}
                          >
                            <span>
                              {new Date(d + "T12:00:00Z").toLocaleDateString(
                                "en-GB",
                                { weekday: "short", timeZone: "UTC" },
                              )}
                            </span>
                            <strong>{d.slice(-2)}</strong>
                            <span>
                              {new Date(d + "T12:00:00Z").toLocaleDateString(
                                "en-GB",
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
                        Available times <small>{p.timezone}</small>
                      </h3>
                      <div className="slot-options">
                        {data.slots
                          .filter((s: any) => dateKey(s.starts_at) === day)
                          .map((s: any) => (
                            <button
                              key={s.id}
                              aria-pressed={slot === s.id}
                              disabled={s.remaining <= 0 || s.status !== "open"}
                              className={slot === s.id ? "selected" : ""}
                              onClick={() => setSlot(s.id)}
                            >
                              <strong>
                                {new Date(s.starts_at).toLocaleTimeString(
                                  "en-GB",
                                  {
                                    timeZone: p.timezone,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}{" "}
                                –{" "}
                                {new Date(s.ends_at).toLocaleTimeString(
                                  "en-GB",
                                  {
                                    timeZone: p.timezone,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </strong>
                              <span>
                                {s.status !== "open"
                                  ? "Closed"
                                  : s.remaining === 0
                                    ? "Fully booked"
                                    : `${s.remaining} places available`}
                              </span>
                            </button>
                          ))}
                      </div>
                      {!day && (
                        <p className="muted">
                          Choose a date to see available times.
                        </p>
                      )}
                      <div className="form-actions">
                        <span className="muted">
                          Your place is reserved when your booking is confirmed.
                        </span>
                        <Button
                          color="primary"
                          isDisabled={!slot}
                          onPress={() => setStep(2)}
                        >
                          Continue
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
                      validateStandardDetails({ name, email, phone }, standard);
                      validateAnswers(p.fields, answers);
                      setStep(3);
                    } catch (e) {
                      setError(validationMessage(e));
                    }
                  }}
                >
                  <span className="eyebrow">02 / YOUR DETAILS</span>
                  <h2>Tell us about yourself</h2>
                  {standard.name.enabled && <Field
                    label="Full name"
                    value={name}
                    onChange={setName}
                    required={standard.name.required}
                    minLength={2}
                    maxLength={200}
                    autoComplete="name"
                  />}
                  {standard.email.enabled && <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    required={standard.email.required}
                    autoComplete="email"
                  />}
                  {standard.phone.enabled && <Field
                    label="Phone number"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    required={standard.phone.required}
                    placeholder="e.g. +62 812 3456 7890"
                    autoComplete="tel"
                  />}
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
                    I agree to the use of my details to manage this booking.
                  </Checkbox>
                  <div className="form-actions">
                    <Button variant="light" onPress={() => setStep(1)}>
                      Back
                    </Button>
                    <Button color="primary" type="submit">
                      Review booking
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="eyebrow">03 / REVIEW & BOOK</span>
                  <h2>Ready to confirm?</h2>
                  <dl className="summary">
                    {standard.name.enabled && <><dt>Name</dt><dd>{name || "Not provided"}</dd></>}
                    {standard.email.enabled && <><dt>Email</dt><dd>{email || "Not provided"}</dd></>}
                    {standard.phone.enabled && <><dt>Phone</dt><dd>{phone || "Not provided"}</dd></>}
                    {p.fields.map((f: any) => (
                      <div key={f.id}>
                        <dt>{f.label}</dt>
                        <dd>{String(answers[f.id] ?? "—")}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="muted">
                    Check your details and selected time before confirming.
                  </p>
                  {submission.state.phase === "submitting" && <div className="booking-progress" role="status">
                    <Loading label="Confirming your booking" />
                    <p>Please wait. Keep this page open while we confirm your time.</p>
                  </div>}
                  {submission.state.error && <div ref={errorRef} tabIndex={-1} role="alert" className="booking-error">
                    <strong>{submission.state.phase === "uncertain" ? "Booking status not verified" : "Booking not confirmed"}</strong>
                    <p>{submission.state.error}</p>
                    <p>{submission.state.phase === "uncertain" ? "Your details are locked until the result is verified. Check and retry uses the same request to prevent duplicate bookings." : "Your details have been kept. Retry this booking, or confirm that you want to return to your details."}</p>
                    {submission.state.phase === "failed" && <Button variant="bordered" onPress={() => setNavigationPrompt("edit")}>Return to details</Button>}
                  </div>}
                  {submission.state.phase === "confirmed" && <div className="booking-progress" role="status"><strong>Booking confirmed</strong><p>Opening your confirmation. If it does not open, use the button below.</p></div>}
                  <div className="form-actions">
                    <Button variant="light" isDisabled={submission.editDisabled} onPress={() => {
                      if (submission.canEdit()) setStep(2);
                    }}>
                      Edit details
                    </Button>
                    {submission.state.phase === "confirmed" ? <Button
                      as="a" href={"/success/" + submission.state.token} color="primary"
                    >Open confirmation</Button> : <Button
                      color="primary"
                      isLoading={submission.state.phase === "submitting"}
                      isDisabled={submission.confirmDisabled}
                      onPress={() => submission.confirm({ slot_id: slot, idempotency_key: key, name, email, phone, consent, answers })}
                    >
                      {submission.state.phase === "submitting" ? "Confirming booking…" : submission.state.phase === "uncertain" ? "Check & retry booking" : submission.state.phase === "failed" ? "Retry booking" : "Confirm booking"}
                    </Button>}

                  </div>
                </>
              )}
            </section>
            <aside>
              <div className="card summary-card">
                <div className="row">
                  <CalendarDays size={20} />
                  <h3>Your booking</h3>
                </div>
                <hr />
                <strong>{p.title}</strong>
                {p.position && <p>{p.position}</p>}
                <p className="muted">
                  {p.location || "Location details to follow"}
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
                    <span>No time selected</span>
                  )}
                </div>
                <p className="muted">
                  Your confirmation and next steps will appear after booking.
                </p>
              </div>
            </aside>
          </div>
        )}
        <Footer config={b.footer} />
      </main>
      <Modal isOpen={!!navigationPrompt} onClose={() => setNavigationPrompt(null)}>
        <ModalContent>
          <ModalHeader>{navigationPrompt === "edit" ? "Return to your details?" : "Leave this booking?"}</ModalHeader>
          <ModalBody><p>{navigationPrompt === "edit"
            ? "Your booking was not confirmed. Returning to your details will reset this failed attempt. You will need to review and confirm again."
            : submission.state.phase === "failed"
              ? "Your booking was not confirmed. Leave this page anyway? Your attempt will be kept in this tab so you can return."
              : "Your booking may still be processing or may already have been saved. Leaving this page will not cancel it. Return and check the same attempt before making another booking."}</p></ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setNavigationPrompt(null)}>Stay on review</Button>
            <Button color="primary" onPress={() => {
              if (navigationPrompt === "edit") {
                if (submission.acknowledgeEdit()) { setKey(crypto.randomUUID()); setError(""); setStep(2); }
                setNavigationPrompt(null);
              } else {
                submission.allowLeave(); window.location.assign(`/b/${company}/${campaign}`);
              }
            }}>{navigationPrompt === "edit" ? "Return to details" : "Leave page"}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
export function SuccessPage({ token }: { token: string }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setError("");
    api("success/" + token, "GET", undefined, { signal: controller.signal })
      .then(result => { setData(result); clearConfirmedAttempts(token); })
      .catch(() => { if (!cancelled) setError("We could not load your confirmation. Retrying this page will not create another booking."); })
      .finally(() => clearTimeout(timeout));
    let cancelled = false;
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [token, retry]);
  return (
    <main className="success-page">
      <div className="card success-card">
        <ShineBorder shineColor={["#7dd3fc", "#15803d"]} />
        <Notice text={error} />
        {error && !data && <Button color="primary" onPress={() => setRetry(value => value + 1)}>Retry confirmation</Button>}
        {data ? (
          <>
            <MotionIcon success />
            <span className="eyebrow">
              {data.status === "cancelled"
                ? "BOOKING CANCELLED"
                : "BOOKING CONFIRMED"}
            </span>
            <h1>
              {data.status === "cancelled"
                ? "This booking has been cancelled"
                : data.config.title}
            </h1>
            <p>{data.status === "cancelled" ? "This time is no longer reserved. Contact the organizer if you need another booking." : data.config.message}</p>
            <div className="success-detail">
              <strong>{data.title}</strong>
              <span>
                {dateTime(data.starts_at, data.timezone)} · {data.timezone}
              </span>
              <span>{data.company}</span>
              <hr />
              <span>Booking code</span>
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
                    (data.whatsapp.phone || data.whatsapp.url ? [
                      data.whatsapp.phone || data.whatsapp.url,
                      data.whatsapp.message,
                    ] : [data.title, data.company, dateTime(data.starts_at, data.timezone) + " · " + data.timezone, "Booking code: " + data.code]).join("\n"),
                  );
                  setCopied(true);
                } catch {
                  setError(
                    "Copy is unavailable. Select and copy the text below.",
                  );
                }
              }}
            >
              {copied ? "Copied" : data.whatsapp.phone || data.whatsapp.url ? "Copy number and message" : "Copy booking details"}
            </Button>
            {(data.whatsapp.phone || data.whatsapp.url) && <details>
              <summary>WhatsApp number and message</summary>
              <p>
                {data.whatsapp.phone ||
                  data.whatsapp.url ||
                  "The organizer has not provided a phone number."}
              </p>
              <p className="pre-wrap">{data.whatsapp.message}</p>
            </details>}
            <small className="muted">
              {data.whatsapp.url ? "Save this page. Your WhatsApp message is sent only after you tap Send in WhatsApp." : "Save this page to keep your booking details."}
            </small>
          </>
        ) : (
          !error && <Loading label="Loading confirmation" />
        )}
      </div>
      {(data || error) && <Footer config={data?.branding?.footer} />}
    </main>
  );
}
