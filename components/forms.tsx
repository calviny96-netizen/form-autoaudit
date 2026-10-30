"use client";
import { useEffect, useState } from "react";
import { Button, Pagination, Tab, Tabs } from "@heroui/react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  FilePlus2,
  MessageSquareHeart,
  Percent,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import {
  api,
  Badge,
  Empty,
  Field,
  SelectField,
  Loading,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Notice,
  dateTime,
} from "./ui";
import HoldButton from "./reactbits/HoldButton";
import { buildTemplate, formTemplates, type TemplateKey } from "@/lib/form-templates";
import { formBackgrounds, responseColumns, slugify, type Lang } from "@/lib/forms";
import "./form-builder.css";
import { FileRetentionNotice, ResponseFile, useFileClock } from "./form-file-retention";

const templateIcons = { blank: FilePlus2, lead: UserPlus, feedback: MessageSquareHeart, registration: CalendarCheck };
const plural = (n: unknown, word: string) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;
// Form links are unique per company; a copy or a second form with the same title gets a numbered link.
function freeSlug(title: string, rows: { slug: string }[]) {
  const base = slugify(title);
  let slug = base;
  for (let n = 2; rows.some((r) => r.slug === slug); n++) slug = `${base}-${n}`;
  return slug;
}

export function FormsGrid({
  cid,
  company,
  rows,
  can,
  setNotice,
  reload,
  onEdit,
  onResponses,
}: {
  cid: string;
  company: any;
  rows: any[];
  can: (p: string) => boolean;
  setNotice: (text: string) => void;
  reload: () => void;
  onEdit: (form: any) => void;
  onResponses: (form: any) => void;
}) {
  const [busy, setBusy] = useState("");
  async function run(id: string, task: (form: any) => Promise<void> | void) {
    setBusy(id);
    try {
      await task(await api(`companies/${cid}/forms/${id}`));
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="company-grid">
      {rows.map((f) => {
        const reachable = ["published", "closed"].includes(f.status);
        return (
          <div className="card campaign-card" key={f.id}>
            <div className="row between">
              <ClipboardList size={25} />
              <Badge value={f.status} />
            </div>
            <h2>{f.title}</h2>
            <p className="muted">
              {plural(f.blocks, "question")} · {plural(f.responses, "response")}
              {Number(f.responses) > 0 && ` · ${f.completed} completed`}
            </p>
            <p className="muted clamp">
              {reachable ? `/f/${company.slug}/${f.slug}` : "Publish this form to get a link you can share."}
            </p>
            <div className="row wrap">
              <Button color="primary" variant="flat" isLoading={busy === f.id} onPress={() => run(f.id, onEdit)}>
                {can("forms.update") ? "Edit form" : "View form"}
              </Button>
              {can("responses.read") && (
                <Button variant="light" onPress={() => onResponses(f)}>
                  Responses
                </Button>
              )}
              {reachable && (
                <>
                  <Button
                    isIconOnly
                    aria-label="Copy form link"
                    variant="light"
                    onPress={async () => {
                      await navigator.clipboard.writeText(`${location.origin}/f/${company.slug}/${f.slug}`);
                      setNotice("Form link copied.");
                    }}
                  >
                    <Copy size={17} />
                  </Button>
                  <Button as="a" href={`/f/${company.slug}/${f.slug}`} target="_blank" isIconOnly aria-label="Open form" variant="light">
                    <ArrowUpRight size={18} />
                  </Button>
                </>
              )}
              {can("forms.create") && (
                <Button
                  variant="light"
                  size="sm"
                  isDisabled={!!busy}
                  onPress={() =>
                    run(f.id, async (form) => {
                      const title = (form.title + " (copy)").slice(0, 200);
                      await api(`companies/${cid}/forms`, "POST", { title, slug: freeSlug(title, rows), status: "draft", definition: form.definition });
                      reload();
                    })
                  }
                >
                  Duplicate form
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {!rows.length && (
        <Empty text="No forms yet">
          <p className="muted">Create a form to collect answers, leads, or feedback.</p>
        </Empty>
      )}
    </div>
  );
}

export function NewFormModal({
  cid,
  company,
  rows,
  isOpen,
  onClose,
  onCreated,
}: {
  cid: string;
  company: any;
  rows: any[];
  isOpen: boolean;
  onClose: () => void;
  onCreated: (form: any) => void;
}) {
  const [title, setTitle] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [template, setTemplate] = useState<TemplateKey>("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setError("");
    setTemplate("blank");
    setLang(navigator.language.toLowerCase().startsWith("id") ? "id" : "en");
  }, [isOpen]);
  return (
    <Modal isOpen={isOpen} onClose={() => !busy && onClose()} isDismissable={!busy} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              // New forms start with the company's brand color; the builder can change it per form.
              const branding = company?.branding ?? {};
              const theme = {
                ...(branding.primary ? { primary: branding.primary } : {}),
                ...(formBackgrounds.includes(branding.background) ? { background: branding.background } : {}),
              };
              onCreated(
                await api(`companies/${cid}/forms`, "POST", {
                  title,
                  slug: freeSlug(title, rows),
                  status: "draft",
                  definition: buildTemplate(template, lang, title.trim(), theme),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ModalHeader>New form</ModalHeader>
          <ModalBody>
            <Notice text={error} />
            <Field label="Form title" value={title} onChange={setTitle} placeholder="e.g. Customer feedback" minLength={2} maxLength={200} required autoFocus />
            <SelectField
              label="Language of buttons and messages"
              value={lang}
              onChange={(v: Lang) => v && setLang(v)}
              options={[
                { value: "en", label: "English" },
                { value: "id", label: "Bahasa Indonesia" },
              ]}
            />
            <div>
              <span className="studio-field-label">Start from</span>
              <div className="template-grid" role="radiogroup" aria-label="Template">
                {formTemplates.map((t) => {
                  const Icon = templateIcons[t.key];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="radio"
                      aria-checked={template === t.key}
                      className={"template-card" + (template === t.key ? " selected" : "")}
                      onClick={() => setTemplate(t.key)}
                    >
                      <Icon size={22} />
                      <strong>{t.name}</strong>
                      <small>{t.description}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" isDisabled={busy} onPress={onClose}>
              Cancel
            </Button>
            <Button color="primary" type="submit" isLoading={busy}>
              Create form
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}

export function FormResponses({
  cid,
  company,
  form,
  can,
  onClose,
}: {
  cid: string;
  company: any;
  form: any;
  can: (p: string) => boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<any>();
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<any>();
  const [busy, setBusy] = useState(false);
  const fileNow = useFileClock();
  const base = `companies/${cid}/forms/${form.id}/responses`;
  const filters = `status=${status}&q=${encodeURIComponent(search)}`;
  useEffect(() => {
    const wait = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(wait);
  }, [query]);
  useEffect(() => {
    let alive = true;
    api(`${base}?${filters}`)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setPage(1);
        setError("");
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [base, filters, tick]);
  const definition = data?.form.definition;
  const columns = data ? responseColumns(definition, data.rows) : [];
  const total = data?.counts.total ?? 0, completed = data?.counts.completed ?? 0;
  const title = (id: string, list: any[]) => list.find((x: any) => x.id === id)?.title;
  return (
    <>
      <Button variant="light" startContent={<ArrowLeft size={16} />} onPress={onClose}>
        Back to forms
      </Button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESPONSES</span>
          <h1>{form.title}</h1>
          <p className="muted">
            Answers are saved while people fill in the form. Unfinished responses are marked Partial.
          </p>
        </div>
        {can("responses.export") && (
          <div className="row wrap">
            <Button as="a" href={`/api/companies/${cid}/forms/${form.id}/files`} variant="bordered" startContent={<Download size={17} />} isDisabled={!data?.counts.files || (!!data?.counts.next_file_expiry && new Date(data.counts.next_file_expiry).getTime() <= fileNow && data.counts.files === 1)}>
              Download all files as ZIP
            </Button>
            <Button as="a" href={`/api/${base}?export=1&${filters}`} variant="bordered" startContent={<Download size={17} />}>
              Export CSV
            </Button>
          </div>
        )}
      </div>
      <Notice text={error} />
      <FileRetentionNotice expires={data?.counts.next_file_expiry} timezone={company?.timezone} now={fileNow} />
      {!data ? (
        !error && (
          <div className="card empty">
            <Loading label="Loading responses" />
          </div>
        )
      ) : (
        <>
          <div className="stats-grid">
            {[
              ["Responses", total, Users],
              ["Completed", completed, CheckCircle2],
              ["Partial", total - completed, Clock3],
              ["Completion rate", total ? Math.round((completed / total) * 100) + "%" : "—", Percent],
            ].map(([label, value, Icon]: any) => (
              <div className="stat-card" key={label}>
                <div className="row between">
                  <span>{label}</span>
                  <Icon size={20} />
                </div>
                <strong>{value}</strong>
                <small>Form total</small>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="response-filters">
              <Field label="Search answers" value={query} onChange={setQuery} placeholder="Name, phone, or any answer" startContent={<Search size={17} />} />
              <Tabs aria-label="Response status" selectedKey={status || "all"} onSelectionChange={(key) => setStatus(key === "all" ? "" : String(key))}>
                <Tab key="all" title="All" />
                <Tab key="completed" title="Completed" />
                <Tab key="partial" title="Partial" />
              </Tabs>
            </div>
            <div className="table-scroll">
              <table className="response-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Status</th>
                    {columns.map((c) => (
                      <th key={c.id}>{c.title}</th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice((page - 1) * 15, page * 15).map((r: any) => (
                    <tr key={r.id}>
                      <td>{dateTime(r.started_at, company?.timezone)}</td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                      {columns.map((c) => (
                        <td key={c.id} title={r.answers[c.id]?.text}>
                          {r.answers[c.id]?.file ? <ResponseFile file={r.answers[c.id].file} text={r.answers[c.id].text} href={`/api/companies/${cid}/forms/${form.id}/files/${r.answers[c.id].file.id}`} now={fileNow} /> : r.answers[c.id]?.text ?? "—"}
                        </td>
                      ))}
                      <td>
                        <Button size="sm" variant="light" onPress={() => setDetail(r)}>
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.rows.length && (
              <Empty text={search || status ? "No matching responses" : "No responses yet"}>
                <p className="muted">
                  {search || status ? "Try a different search or filter." : "Share the form link to start collecting answers."}
                </p>
              </Empty>
            )}
            {data.rows.length > 15 && <Pagination total={Math.ceil(data.rows.length / 15)} page={page} onChange={setPage} />}
          </div>
        </>
      )}
      <Modal isOpen={!!detail} onClose={() => !busy && setDetail(undefined)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {detail && (
            <>
              <ModalHeader>Response details</ModalHeader>
              <ModalBody>
                <Notice text={error} />
                <div className="response-meta">
                  <div>
                    <small>Status</small>
                    <Badge value={detail.status} />
                  </div>
                  <div>
                    <small>Started</small>
                    {dateTime(detail.started_at, company?.timezone)}
                  </div>
                  <div>
                    <small>{detail.status === "completed" ? "Submitted" : "Last answer"}</small>
                    {dateTime(detail.completed_at ?? detail.updated_at, company?.timezone)}
                  </div>
                  <div>
                    <small>{detail.status === "completed" ? "Ending shown" : "Stopped at"}</small>
                    {(detail.status === "completed"
                      ? title(detail.ending_id, definition.endings)
                      : title(detail.position, definition.blocks)) || "—"}
                  </div>
                </div>
                <div className="response-answers">
                  {columns
                    .filter((c) => detail.answers[c.id])
                    .map((c) => (
                      <div key={c.id}>
                        <small>{c.title}</small>
                        {detail.answers[c.id].file ? <ResponseFile file={detail.answers[c.id].file} text={detail.answers[c.id].text} href={`/api/companies/${cid}/forms/${form.id}/files/${detail.answers[c.id].file.id}`} now={fileNow} /> : <p>{detail.answers[c.id].text}</p>}
                      </div>
                    ))}
                  {!Object.keys(detail.answers).length && <p className="muted">No answers were saved.</p>}
                </div>
              </ModalBody>
              <ModalFooter>
                {can("responses.delete") && (
                  <HoldButton
                    disabled={busy}
                    holdTime={900}
                    wave={false}
                    glow={false}
                    fillColor="#b91c1c"
                    backgroundColor="#fee2e2"
                    textColor="#991b1b"
                    doneLabel="Deleting"
                    onHold={async () => {
                      setBusy(true);
                      try {
                        await api(`${base}/${detail.id}`, "DELETE");
                        setDetail(undefined);
                        setTick((n) => n + 1);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Hold to delete
                  </HoldButton>
                )}
                <Button isDisabled={busy} onPress={() => setDetail(undefined)}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
