"use client";
import { DuplicateSettings } from "./duplicate-settings";
import { duplicateTypes } from "@/lib/duplicates";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Select,
  SelectItem,
  Switch,
  Tab,
  Tabs,
  Tooltip,
} from "@heroui/react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  EllipsisVertical,
  Eye,
  Flag,
  GitBranch,
  GripVertical,
  Hand,
  ImagePlus,
  LayoutList,
  Monitor,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Share2,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  Badge,
  Field,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Notice,
  SelectField,
} from "./ui";
import { FormRunner, type RunnerScreen } from "./form-runner";
import { formIconMap, presetIcons, typeIcons } from "./form-icons";
import { luminance } from "@/lib/schema";
import {
  blockPresets,
  blockTypes,
  branches,
  canonical,
  clearInvalidJumps,
  createBlock,
  createEnding,
  formBackgrounds,
  formDefinition,
  formIcons,
  formStrings,
  hasChoices,
  newId,
  typeLabels,
  validLink,
  type BlockType,
  type FormBlock,
  type FormDefinition,
  type FormEnding,
  type PresetKey,
} from "@/lib/forms";
import "./form-builder.css";

type Selected = RunnerScreen | { kind: "design" } | { kind: "settings" };
type Draft = { title: string; slug: string; status: string; definition: FormDefinition };
type Target = { value: string; label: string };
const groups: Record<BlockType, string> = {
  short_text: "text",
  long_text: "text",
  statement: "text",
  email: "contact",
  phone: "contact",
  choice: "choice",
  multi: "choice",
  dropdown: "choice",
  rating: "rating",
  scale: "rating",
  number: "other",
  file_upload: "other",
  date: "other",
};
const jumpCount = (d: FormDefinition) =>
  d.blocks.reduce((n, b) => n + (b.next ? 1 : 0) + b.options.filter((o) => o.goto).length, 0);
const contrastOk = (hex: string) =>
  /^#[0-9a-fA-F]{6}$/.test(hex) && 1.05 / (luminance(hex) + 0.05) >= 4.5;

// Problems the server would reject, found early so the builder can point at the block to fix.
function findProblems(v: Draft) {
  const list: { target: Selected; message: string }[] = [];
  if (v.title.trim().length < 2)
    list.push({ target: { kind: "settings" }, message: "Give the form a title." });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug))
    list.push({ target: { kind: "settings" }, message: "The form link can only use lowercase letters, numbers, and single hyphens." });
  if (!contrastOk(v.definition.theme.primary))
    list.push({ target: { kind: "design" }, message: "Choose a darker button color so white text stays readable." });
  for (const b of v.definition.blocks) {
    const target = { kind: "block" as const, id: b.id };
    if (!b.title.trim()) list.push({ target, message: "Add a title to every question." });
    else if (hasChoices(b) && !b.options.length)
      list.push({ target, message: `Add at least one answer option to "${b.title}".` });
    else if (hasChoices(b) && b.options.some((o) => !o.label.trim()))
      list.push({ target, message: `Fill in or remove the empty answer option in "${b.title}".` });
    else if (b.min !== undefined && b.max !== undefined && b.min > b.max)
      list.push({ target, message: `The minimum is above the maximum in "${b.title}".` });
  }
  for (const e of v.definition.endings) {
    const target = { kind: "ending" as const, id: e.id };
    if (e.buttons.some((x) => !x.label.trim()))
      list.push({ target, message: "Give every ending button a label." });
    else if (e.buttons.some((x) => !validLink(x.url)))
      list.push({ target, message: "Button links must start with https://, mailto:, or tel:" });
  }
  return list;
}

export default function FormBuilder({
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
  const [v, setV] = useState<Draft>(() => ({
    title: form.title,
    slug: form.slug,
    status: form.status,
    definition: formDefinition.parse(form.definition),
  }));
  const start = (d: FormDefinition): RunnerScreen =>
    d.blocks[0] ? { kind: "block", id: d.blocks[0].id } : { kind: "welcome" };
  const [saved, setSaved] = useState(() => canonical(v));
  const [live, setLive] = useState<string>(form.status);
  const [selected, setSelected] = useState<Selected>(() => start(v.definition));
  const [focus, setFocus] = useState<RunnerScreen>(() => start(v.definition));
  const [pane, setPane] = useState<"list" | "edit" | "preview">("list");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [run, setRun] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState<"" | "leave" | "share">("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState<PresetKey | null>(null);
  const [toolbox, setToolbox] = useState(true);
  const def = v.definition;
  const lang = def.settings.language;
  const t = formStrings[lang];
  const dirty = useMemo(() => canonical(v) !== saved, [v, saved]);
  const problems = useMemo(() => findProblems(v), [v]);
  // Changing a published form needs the publish permission, the same rule the API applies.
  const locked = !can("forms.update") || (live === "published" && !can("forms.publish"));
  const link = `${location.origin}/f/${company.slug}/${v.slug}`;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // A block dragged from the palette only lands where the pointer is; reordering snaps to the nearest row.
  const collision: CollisionDetection = (args) =>
    String(args.active.id).startsWith("new:") ? pointerWithin(args) : closestCenter(args);
  const state = useRef({ dirty, save: () => Promise.resolve(false) });
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (!state.current.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (state.current.dirty) state.current.save();
      }
    };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("keydown", key);
    };
  }, []);
  function select(next: Selected, show: typeof pane | null = "edit") {
    setSelected(next);
    if (next.kind !== "design" && next.kind !== "settings") setFocus(next);
    if (show) setPane(show);
  }
  // Reordering or removing blocks can leave a jump pointing backwards or at nothing; those are reset.
  function apply(next: FormDefinition, announce = false) {
    const clean = clearInvalidJumps(next);
    const lost = jumpCount(next) - jumpCount(clean);
    setV((prev) => ({ ...prev, definition: clean }));
    if (announce)
      setNotice(
        lost
          ? `${lost} logic jump${lost > 1 ? "s were" : " was"} reset because the target was removed or now comes earlier.`
          : "",
      );
  }
  const patchBlock = (id: string, patch: Partial<FormBlock>) =>
    apply({ ...def, blocks: def.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const patchEnding = (id: string, patch: Partial<FormEnding>) =>
    apply({ ...def, endings: def.endings.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const patchTheme = (patch: Partial<FormDefinition["theme"]>) =>
    apply({ ...def, theme: { ...def.theme, ...patch } });
  const patchSettings = (patch: Partial<FormDefinition["settings"]>) =>
    apply({ ...def, settings: { ...def.settings, ...patch } });
  const patchWelcome = (patch: Partial<FormDefinition["welcome"]>) =>
    apply({ ...def, welcome: { ...def.welcome, ...patch } });
  function addBlock(key: PresetKey, at?: number) {
    if (locked || def.blocks.length >= 100) return;
    const block = createBlock(key, lang);
    const current = selected.kind === "block" ? def.blocks.findIndex((b) => b.id === selected.id) : -1;
    const index = at ?? (current >= 0 ? current + 1 : def.blocks.length);
    apply({ ...def, blocks: [...def.blocks.slice(0, index), block, ...def.blocks.slice(index)] });
    select({ kind: "block", id: block.id });
  }
  function duplicateBlock(id: string) {
    const i = def.blocks.findIndex((b) => b.id === id);
    if (i < 0 || def.blocks.length >= 100) return;
    const copy = { ...def.blocks[i], id: newId(), options: def.blocks[i].options.map((o) => ({ ...o, id: newId() })) };
    apply({ ...def, blocks: [...def.blocks.slice(0, i + 1), copy, ...def.blocks.slice(i + 1)] });
    select({ kind: "block", id: copy.id });
  }
  function removeBlock(id: string) {
    const i = def.blocks.findIndex((b) => b.id === id);
    const blocks = def.blocks.filter((b) => b.id !== id);
    apply({ ...def, blocks }, true);
    const neighbor = blocks[Math.min(i, blocks.length - 1)];
    select(neighbor ? { kind: "block", id: neighbor.id } : { kind: "welcome" }, null);
  }
  function moveBlock(from: number, to: number) {
    if (from < 0 || to < 0 || to >= def.blocks.length || from === to) return;
    apply({ ...def, blocks: arrayMove(def.blocks, from, to) }, true);
  }
  function addEnding() {
    if (def.endings.length >= 10) return;
    const ending = createEnding(lang);
    apply({ ...def, endings: [...def.endings, ending] });
    select({ kind: "ending", id: ending.id });
  }
  function removeEnding(id: string) {
    const endings = def.endings.filter((e) => e.id !== id);
    if (!endings.length) return;
    apply({ ...def, endings }, true);
    select({ kind: "ending", id: endings[0].id }, null);
  }
  function dragEnd(e: DragEndEvent) {
    setDragging(null);
    const active = String(e.active.id), over = e.over ? String(e.over.id) : "";
    if (!over) return;
    const to = over === "blocks-end" ? def.blocks.length : def.blocks.findIndex((b) => b.id === over);
    if (active.startsWith("new:")) {
      if (to >= 0) addBlock(active.slice(4) as PresetKey, to);
    } else moveBlock(def.blocks.findIndex((b) => b.id === active), Math.min(to, def.blocks.length - 1));
  }
  async function save(status = v.status) {
    if (problems.length) {
      setNotice(problems[0].message);
      select(problems[0].target);
      return false;
    }
    if (status === "published" && !def.blocks.length) {
      setNotice("Add at least one question before publishing.");
      return false;
    }
    setBusy(true);
    try {
      const f = await api(`companies/${cid}/forms/${form.id}`, "POST", { ...v, status });
      const next = { title: f.title, slug: f.slug, status: f.status, definition: formDefinition.parse(f.definition) };
      setV(next);
      setSaved(canonical(next));
      setLive(f.status);
      setNotice("");
      return true;
    } catch (e) {
      setNotice((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  state.current = { dirty, save: () => (locked || busy ? Promise.resolve(false) : save()) };
  async function upload(file: File, kind: "banner" | "image") {
    const data = new FormData();
    data.set("file", file);
    data.set("kind", kind);
    return (await api(`companies/${cid}/form-assets`, "POST", data)).url as string;
  }
  const numberOf = (b: FormBlock) =>
    b.type === "statement"
      ? 0
      : def.blocks.slice(0, def.blocks.indexOf(b) + 1).filter((x) => x.type !== "statement").length;
  const block = selected.kind === "block" ? def.blocks.find((b) => b.id === selected.id) : undefined;
  const ending = selected.kind === "ending" ? def.endings.find((e) => e.id === selected.id) : undefined;
  const flagged = (target: Selected) =>
    problems.some((p) => p.target.kind === target.kind && (p.target as { id?: string }).id === (target as { id?: string }).id);

  function blockPanel(b: FormBlock) {
    const i = def.blocks.indexOf(b);
    const Icon = typeIcons[b.type];
    const patch = (p: Partial<FormBlock>) => patchBlock(b.id, p);
    const targets: Target[] = [
      { value: "next", label: i + 1 < def.blocks.length ? "Next question" : "Default ending" },
      ...def.blocks.slice(i + 1).map((x) => ({
        value: x.id,
        label: `${numberOf(x) ? numberOf(x) + ". " : ""}${x.title || "Untitled"}`,
      })),
      ...def.endings.map((e) => ({ value: e.id, label: "Ending: " + (e.title || "Untitled") })),
    ];
    const number = (key: "min" | "max", label: string) => (
      <Field
        label={label}
        type="number"
        value={b[key] ?? ""}
        onChange={(s: string) => patch({ [key]: s === "" ? undefined : Number(s) })}
      />
    );
    return (
      <>
        <div className="studio-panel-head">
          <span className={"studio-chip g-" + groups[b.type]}>
            <Icon size={16} />
          </span>
          <div>
            <small>{numberOf(b) ? `Question ${numberOf(b)}` : "Block"}</small>
            <strong>{typeLabels[b.type]}</strong>
          </div>
        </div>
        <SelectField
          label="Block type"
          value={b.type}
          onChange={(type: BlockType) => {
            if (!type || type === b.type) return;
            const made = createBlock(type, lang);
            patch({
              type,
              required: type === "statement" ? false : b.required,
              options: hasChoices({ type }) ? (b.options.length ? b.options : made.options) : [],
              min: made.min,
              max: made.max,
              low: made.low,
              high: made.high,
              placeholder: "",
            });
          }}
          options={blockTypes.map((value) => ({ value, label: typeLabels[value] }))}
        />
        <Field
          label={b.type === "statement" ? "Text" : "Question"}
          type="textarea"
          minRows={1}
          maxLength={300}
          value={b.title}
          onChange={(title: string) => patch({ title })}
        />
        <Field
          label="Description (optional)"
          type="textarea"
          minRows={1}
          maxLength={1000}
          value={b.description}
          onChange={(description: string) => patch({ description })}
        />
        {b.type !== "statement" && (
          <Switch size="sm" isSelected={b.required} onValueChange={(required) => patch({ required })}>
            Required
          </Switch>
        )}
        {b.type === "file_upload" && <p className="muted">One file per question, up to 5 MB. JPEG, JPG, PNG, SVG, PDF, MD, DOC, DOCX, XLSX, or CSV. Files are available in Responses.</p>}
        {hasChoices(b) && (
          <OptionsEditor block={b} onChange={(options) => patch({ options })} />
        )}
        {["short_text", "long_text", "email", "phone", "number", "dropdown"].includes(b.type) && (
          <Field
            label="Placeholder (optional)"
            maxLength={200}
            value={b.placeholder}
            onChange={(placeholder: string) => patch({ placeholder })}
          />
        )}
        {(b.type === "short_text" || b.type === "long_text") && (
          <div className="studio-pair">
            {number("min", "Min characters")}
            {number("max", "Max characters")}
          </div>
        )}
        {b.type === "number" && (
          <div className="studio-pair">
            {number("min", "Minimum")}
            {number("max", "Maximum")}
          </div>
        )}
        {b.type === "multi" && (
          <div className="studio-pair">
            {number("min", "Min choices")}
            {number("max", "Max choices")}
          </div>
        )}
        {b.type === "rating" && (
          <SelectField
            label="Number of stars"
            value={String(b.max ?? 5)}
            onChange={(s: string) => s && patch({ max: Number(s) })}
            options={[3, 4, 5, 6, 7, 8, 9, 10].map(String)}
          />
        )}
        {b.type === "scale" && (
          <>
            <div className="studio-pair">
              <SelectField
                label="Starts at"
                value={String(b.min ?? 0)}
                onChange={(s: string) => s && patch({ min: Number(s) })}
                options={["0", "1"]}
              />
              <SelectField
                label="Ends at"
                value={String(b.max ?? 10)}
                onChange={(s: string) => s && patch({ max: Number(s) })}
                options={[5, 6, 7, 8, 9, 10].map(String)}
              />
            </div>
            <div className="studio-pair">
              <Field label="Low label" maxLength={60} value={b.low} onChange={(low: string) => patch({ low })} />
              <Field label="High label" maxLength={60} value={b.high} onChange={(high: string) => patch({ high })} />
            </div>
          </>
        )}
        <div className="studio-section">
          <h3>
            <GitBranch size={15} /> Logic
          </h3>
          {branches(b) &&
            b.options.map((o) => (
              <div className="studio-jump" key={o.id}>
                <span title={o.label}>
                  If <strong>{o.label || "…"}</strong>
                </span>
                <JumpSelect
                  label={`After ${o.label}, go to`}
                  value={o.goto}
                  targets={targets}
                  onChange={(goto) => patch({ options: b.options.map((x) => (x.id === o.id ? { ...x, goto } : x)) })}
                />
              </div>
            ))}
          <div className="studio-jump">
            <span>{branches(b) ? "Otherwise go to" : "Then go to"}</span>
            <JumpSelect label="Then go to" value={b.next} targets={targets} onChange={(next) => patch({ next })} />
          </div>
          <small className="muted">Jumps only go forward, so every path reaches an ending.</small>
        </div>
      </>
    );
  }
  function endingPanel(e: FormEnding) {
    const patch = (p: Partial<FormEnding>) => patchEnding(e.id, p);
    const setButton = (id: string, p: Partial<FormEnding["buttons"][number]>) =>
      patch({ buttons: e.buttons.map((x) => (x.id === id ? { ...x, ...p } : x)) });
    const first = def.endings[0].id === e.id;
    return (
      <>
        <div className="studio-panel-head">
          <span className="studio-chip g-end">
            <Flag size={16} />
          </span>
          <div>
            <small>{first ? "Default ending" : "Ending"}</small>
            <strong>Ending page</strong>
          </div>
        </div>
        <Field label="Title" maxLength={200} value={e.title} placeholder={t.thanksTitle} onChange={(title: string) => patch({ title })} />
        <Field label="Message" type="textarea" minRows={2} maxLength={2000} value={e.message} onChange={(message: string) => patch({ message })} />
        <div>
          <span className="studio-field-label">Icon or image</span>
          <Tabs
            size="sm"
            aria-label="Icon or image"
            selectedKey={e.media}
            onSelectionChange={(key) => patch({ media: key as FormEnding["media"] })}
          >
            <Tab key="icon" title="Icon" />
            <Tab key="image" title="Image" />
            <Tab key="none" title="None" />
          </Tabs>
        </div>
        {e.media === "icon" && (
          <div className="studio-icons" role="radiogroup" aria-label="Ending icon">
            {formIcons.map((name) => {
              const Icon = formIconMap[name];
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={e.icon === name}
                  aria-label={name}
                  title={name}
                  className={e.icon === name ? "selected" : ""}
                  onClick={() => patch({ icon: name })}
                >
                  <Icon size={19} />
                </button>
              );
            })}
          </div>
        )}
        {e.media === "image" && (
          <ImageField
            label="Image"
            hint="PNG, JPEG, or WebP, up to 5 MB. Transparent PNGs keep their transparency."
            value={e.image}
            onUpload={(file) => upload(file, "image")}
            onChange={(image) => patch({ image })}
          />
        )}
        <div className="studio-section">
          <h3>Buttons</h3>
          {e.buttons.map((b, i) => (
            <div className="studio-button-card" key={b.id}>
              <div className="row">
                <strong>Button {i + 1}</strong>
                <button type="button" className="studio-x" aria-label={`Remove button ${i + 1}`} onClick={() => patch({ buttons: e.buttons.filter((x) => x.id !== b.id) })}>
                  <Trash2 size={15} />
                </button>
              </div>
              <Field label="Label" maxLength={60} value={b.label} onChange={(label: string) => setButton(b.id, { label })} />
              <Field
                label="Link"
                maxLength={2000}
                value={b.url}
                placeholder="https://"
                isInvalid={!!b.url && !validLink(b.url)}
                description="A web address, WhatsApp link (https://wa.me/…), mailto:, or tel:"
                onChange={(url: string) => setButton(b.id, { url })}
                onBlur={() => {
                  // "example.com" and "wa.me/62…" are completed to full links.
                  const url = b.url.trim();
                  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) setButton(b.id, { url: "https://" + url });
                }}
              />
              <div className="studio-pair">
                <SelectField
                  label="Style"
                  value={b.style}
                  onChange={(style: any) => style && setButton(b.id, { style })}
                  options={[
                    { value: "primary", label: "Filled" },
                    { value: "outline", label: "Outline" },
                    { value: "light", label: "Text" },
                  ]}
                />
                <Select
                  label="Icon"
                  labelPlacement="outside"
                  variant="bordered"
                  selectedKeys={[b.icon || "none"]}
                  disallowEmptySelection
                  onChange={(event) => setButton(b.id, { icon: (event.target.value === "none" ? "" : event.target.value) as any })}
                >
                  {["none", ...formIcons].map((name) => {
                    const Icon = name === "none" ? null : formIconMap[name as keyof typeof formIconMap];
                    return (
                      <SelectItem key={name} startContent={Icon && <Icon size={16} />}>
                        {name === "none" ? "No icon" : name[0].toUpperCase() + name.slice(1)}
                      </SelectItem>
                    );
                  })}
                </Select>
              </div>
              <Switch size="sm" isSelected={b.new_tab} onValueChange={(new_tab) => setButton(b.id, { new_tab })}>
                Open in a new tab
              </Switch>
            </div>
          ))}
          <Button
            variant="bordered"
            startContent={<Plus size={16} />}
            isDisabled={e.buttons.length >= 6}
            onPress={() =>
              patch({
                buttons: [...e.buttons, { id: newId(), label: lang === "id" ? "Kunjungi situs kami" : "Visit our website", url: "", style: e.buttons.length ? "outline" : "primary", icon: "", new_tab: true }],
              })
            }
          >
            Add button
          </Button>
        </div>
        <div className="studio-section">
          <Switch size="sm" isSelected={e.restart} onValueChange={(restart) => patch({ restart })}>
            Show a "fill out again" button
          </Switch>
          {e.restart && (
            <Field label="Button label" maxLength={60} value={e.restart_label} placeholder={t.restart} onChange={(restart_label: string) => patch({ restart_label })} />
          )}
        </div>
        {def.endings.length > 1 && (
          <div className="studio-section">
            {!first && (
              <Button
                variant="bordered"
                onPress={() => apply({ ...def, endings: [e, ...def.endings.filter((x) => x.id !== e.id)] })}
              >
                Make this the default ending
              </Button>
            )}
            <Button color="danger" variant="light" startContent={<Trash2 size={16} />} onPress={() => removeEnding(e.id)}>
              Delete this ending
            </Button>
            <small className="muted">
              Respondents reach the default ending unless a logic jump sends them to another one.
            </small>
          </div>
        )}
      </>
    );
  }
  const designPanel = (
    <>
      <h2>Design</h2>
      <SelectField
        label="Logo"
        value={def.theme.logo_mode}
        onChange={(logo_mode: any) => logo_mode && patchTheme({ logo_mode })}
        options={[
          { value: "company", label: "Company logo" },
          { value: "custom", label: "Custom logo" },
          { value: "none", label: "No logo" },
        ]}
      />
      {def.theme.logo_mode === "custom" && (
        <ImageField
          label="Custom logo"
          hint="PNG, JPEG, or WebP, up to 5 MB. Transparent PNGs work best."
          value={def.theme.logo}
          onUpload={(file) => upload(file, "image")}
          onChange={(logo) => patchTheme({ logo })}
        />
      )}
      <ImageField
        label="Banner"
        wide
        hint="A wide image works best, for example 1600 × 500 pixels. Up to 5 MB."
        value={def.theme.banner}
        onUpload={(file) => upload(file, "banner")}
        onChange={(banner) => patchTheme({ banner })}
      />
      {def.theme.banner && (
        <SelectField
          label="Show banner on"
          value={def.theme.banner_scope}
          onChange={(banner_scope: any) => banner_scope && patchTheme({ banner_scope })}
          options={[
            { value: "welcome", label: "Welcome screen only" },
            { value: "all", label: "Every screen" },
          ]}
        />
      )}
      {def.theme.banner && def.theme.banner_scope === "welcome" && !def.welcome.enabled && (
        <small className="muted">The welcome screen is hidden, so the banner is not shown.</small>
      )}
      <Field
        label="Button color"
        type="color"
        value={def.theme.primary}
        isInvalid={!contrastOk(def.theme.primary)}
        description="Needs at least 4.5:1 contrast against white text."
        onChange={(primary: string) => patchTheme({ primary })}
      />
      <div>
        <span className="studio-field-label">Background</span>
        <div className="studio-swatches" role="radiogroup" aria-label="Background">
          {formBackgrounds.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={def.theme.background === color}
              aria-label={"Background " + color}
              className={def.theme.background === color ? "selected" : ""}
              style={{ background: color }}
              onClick={() => patchTheme({ background: color })}
            />
          ))}
        </div>
      </div>
      <Switch size="sm" isSelected={def.settings.progress} onValueChange={(progress) => patchSettings({ progress })}>
        Show progress bar
      </Switch>
      <Switch size="sm" isSelected={def.settings.numbers} onValueChange={(numbers) => patchSettings({ numbers })}>
        Show question numbers
      </Switch>
    </>
  );
  const settingsPanel = (
    <>
      <h2>Settings</h2>
      <DuplicateSettings rule={def.settings.duplicate_rule} onChange={duplicate_rule => patchSettings({ duplicate_rule })} options={def.blocks.filter(block => duplicateTypes.includes(block.type)).map(block => ({ key: block.id, label: block.title || "Untitled question" }))} />
      <Field label="Form title" maxLength={200} value={v.title} onChange={(title: string) => setV((p) => ({ ...p, title }))} required />
      <p className="muted">{link}</p>
      <p className="muted">Your link is created automatically from the title. Contact Super Admin if you need a custom link.</p>
      <SelectField
        label="Status"
        value={v.status}
        onChange={(status: string) => status && setV((p) => ({ ...p, status }))}
        options={[
          "draft",
          ...(can("forms.publish") ? ["published", "closed"] : []),
          ...(can("forms.archive") ? ["archived"] : []),
        ]}
      />
      <small className="muted">
        Published forms accept answers. Closed forms show a closed message. Draft and archived forms cannot be opened by respondents.
      </small>
      <SelectField
        label="Language of buttons and messages"
        value={lang}
        onChange={(language: any) => language && patchSettings({ language })}
        options={[
          { value: "en", label: "English" },
          { value: "id", label: "Bahasa Indonesia" },
        ]}
      />
      <Field
        label="Submit button label"
        maxLength={40}
        value={def.settings.submit_label}
        placeholder={t.submit}
        onChange={(submit_label: string) => patchSettings({ submit_label })}
      />
      <small className="muted">
        Answers are saved while a respondent fills in the form, so unfinished responses appear as Partial.
      </small>
    </>
  );
  const welcomePanel = (
    <>
      <div className="studio-panel-head">
        <span className="studio-chip">
          <Hand size={16} />
        </span>
        <div>
          <small>First screen</small>
          <strong>Welcome screen</strong>
        </div>
      </div>
      <Switch size="sm" isSelected={def.welcome.enabled} onValueChange={(enabled) => patchWelcome({ enabled })}>
        Show a welcome screen
      </Switch>
      {def.welcome.enabled && (
        <>
          <Field label="Title" maxLength={200} value={def.welcome.title} placeholder={v.title} onChange={(title: string) => patchWelcome({ title })} />
          <Field label="Description" type="textarea" minRows={2} maxLength={2000} value={def.welcome.description} onChange={(description: string) => patchWelcome({ description })} />
          <Field label="Button label" maxLength={40} value={def.welcome.button} placeholder={t.start} onChange={(button: string) => patchWelcome({ button })} />
        </>
      )}
    </>
  );
  return (
    <div className="studio" data-pane={pane}>
      <header className="studio-bar">
        <Tooltip content="Back to forms">
          <Button isIconOnly variant="light" aria-label="Back to forms" onPress={() => (dirty ? setPrompt("leave") : onClose())}>
            <ArrowLeft size={19} />
          </Button>
        </Tooltip>
        <div className="studio-title">
          <strong>{v.title || "Untitled form"}</strong>
          <Badge value={live} />
        </div>
        <span className="studio-state" role="status">
          {locked ? "View only" : busy ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button
          variant={selected.kind === "design" ? "flat" : "light"}
          color={selected.kind === "design" ? "primary" : "default"}
          startContent={<Palette size={17} />}
          onPress={() => select({ kind: "design" })}
        >
          Design
        </Button>
        <Button
          variant={selected.kind === "settings" ? "flat" : "light"}
          color={selected.kind === "settings" ? "primary" : "default"}
          startContent={<Settings2 size={17} />}
          onPress={() => select({ kind: "settings" })}
        >
          Settings
        </Button>
        {live === "published" && (
          <Button variant="light" startContent={<Share2 size={17} />} onPress={() => setPrompt("share")}>
            Share
          </Button>
        )}
        {!locked && (
          <Button variant="bordered" isDisabled={!dirty || busy} isLoading={busy} onPress={() => save()}>
            Save
          </Button>
        )}
        {!locked && v.status !== "published" && can("forms.publish") && (
          <Button
            color="primary"
            isDisabled={busy}
            onPress={async () => {
              if (await save("published")) setPrompt("share");
            }}
          >
            Publish
          </Button>
        )}
      </header>
      {notice && (
        <div className="studio-notice">
          <Notice text={notice} />
        </div>
      )}
      <div className="studio-body">
        <aside className="studio-left" aria-label="Form content">
          <DndContext
            id="form-blocks"
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={(e) => {
              const id = String(e.active.id);
              setDragging(id.startsWith("new:") ? (id.slice(4) as PresetKey) : null);
            }}
            onDragEnd={dragEnd}
            onDragCancel={() => setDragging(null)}
          >
            <div className="studio-content">
              <button
                type="button"
                className={"studio-row plain" + (selected.kind === "welcome" ? " selected" : "")}
                onClick={() => select({ kind: "welcome" })}
              >
                <span className="studio-chip">
                  <Hand size={15} />
                </span>
                <span className="studio-row-text">
                  <small>Welcome screen</small>
                  <strong>{def.welcome.enabled ? def.welcome.title || v.title : "Hidden"}</strong>
                </span>
              </button>
              <div className="studio-label">Questions</div>
              <SortableContext items={def.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                {def.blocks.map((b, i) => (
                  <BlockRow
                    key={b.id}
                    block={b}
                    number={numberOf(b)}
                    selected={selected.kind === "block" && selected.id === b.id}
                    warning={flagged({ kind: "block", id: b.id })}
                    locked={locked}
                    onSelect={() => select({ kind: "block", id: b.id })}
                    onAction={(action) =>
                      action === "duplicate"
                        ? duplicateBlock(b.id)
                        : action === "delete"
                          ? removeBlock(b.id)
                          : moveBlock(i, action === "up" ? i - 1 : i + 1)
                    }
                    first={i === 0}
                    last={i === def.blocks.length - 1}
                  />
                ))}
              </SortableContext>
              <EndZone empty={!def.blocks.length} adding={!!dragging} />
              <div className="studio-label">
                Endings
                {!locked && def.endings.length < 10 && (
                  <button type="button" aria-label="Add ending" title="Add ending" onClick={addEnding}>
                    <Plus size={15} />
                  </button>
                )}
              </div>
              {def.endings.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  className={"studio-row plain" + (selected.kind === "ending" && selected.id === e.id ? " selected" : "")}
                  onClick={() => select({ kind: "ending", id: e.id })}
                >
                  <span className="studio-chip g-end">
                    <Flag size={15} />
                  </span>
                  <span className="studio-row-text">
                    <small>{i === 0 ? "Default ending" : "Ending"}</small>
                    <strong>{e.title || t.thanksTitle}</strong>
                  </span>
                  {flagged({ kind: "ending", id: e.id }) && <CircleAlert size={15} className="studio-warn" />}
                </button>
              ))}
            </div>
            {!locked && (
              <div className="studio-toolbox">
                <button
                  type="button"
                  className="studio-label studio-toggle"
                  aria-expanded={toolbox}
                  onClick={() => setToolbox(!toolbox)}
                >
                  <span>
                    Add a block <small>click or drag into the list</small>
                  </span>
                  {toolbox ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
                {toolbox && (
                  <div className="studio-palette">
                    {blockPresets.map((p) => (
                      <PaletteItem key={p.key} preset={p} disabled={def.blocks.length >= 100} onAdd={() => addBlock(p.key)} />
                    ))}
                  </div>
                )}
              </div>
            )}
            <DragOverlay dropAnimation={null}>
              {dragging && <PaletteChip preset={blockPresets.find((p) => p.key === dragging)!} className="overlay" />}
            </DragOverlay>
          </DndContext>
        </aside>
        <section className="studio-center" aria-label="Preview">
          <div className="studio-preview-bar">
            <span className="studio-label">Preview</span>
            <div className="row">
              {(["mobile", "desktop"] as const).map((key) => (
                <Tooltip key={key} content={key === "mobile" ? "Phone" : "Desktop"}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant={device === key ? "flat" : "light"}
                    color={device === key ? "primary" : "default"}
                    aria-label={key === "mobile" ? "Phone preview" : "Desktop preview"}
                    aria-pressed={device === key}
                    onPress={() => setDevice(key)}
                  >
                    {key === "mobile" ? <Smartphone size={17} /> : <Monitor size={17} />}
                  </Button>
                </Tooltip>
              ))}
              <Tooltip content="Restart preview">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label="Restart preview"
                  onPress={() => {
                    setFocus(def.welcome.enabled ? { kind: "welcome" } : start(def));
                    setRun((n) => n + 1);
                  }}
                >
                  <RotateCcw size={16} />
                </Button>
              </Tooltip>
              {live === "published" && (
                <Button as="a" href={link} target="_blank" size="sm" variant="light" endContent={<ArrowUpRight size={15} />}>
                  Open live form
                </Button>
              )}
            </div>
          </div>
          <div className="studio-preview">
            <div className={"phone " + device}>
              <div className="phone-screen">
                <FormRunner key={run} embedded definition={def} title={v.title} company={company} focus={focus} />
              </div>
            </div>
          </div>
        </section>
        <aside className="studio-right" aria-label="Settings for the selected item">
          <fieldset disabled={locked} className="studio-form">
            {selected.kind === "design"
              ? designPanel
              : selected.kind === "settings"
                ? settingsPanel
                : selected.kind === "welcome"
                  ? welcomePanel
                  : block
                    ? blockPanel(block)
                    : ending
                      ? endingPanel(ending)
                      : <p className="muted">Choose a block on the left to edit it.</p>}
          </fieldset>
        </aside>
      </div>
      <nav className="studio-switch" aria-label="Builder views">
        {(
          [
            ["list", "Blocks", LayoutList],
            ["edit", "Edit", Pencil],
            ["preview", "Preview", Eye],
          ] as const
        ).map(([key, label, Icon]) => (
          <button key={key} type="button" aria-pressed={pane === key} className={pane === key ? "active" : ""} onClick={() => setPane(key)}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>
      <Modal isOpen={prompt === "leave"} onClose={() => setPrompt("")}>
        <ModalContent>
          <ModalHeader>Leave without saving?</ModalHeader>
          <ModalBody>
            <p>Your latest changes to this form have not been saved.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setPrompt("")}>
              Keep editing
            </Button>
            <Button color="danger" variant="flat" onPress={onClose}>
              Discard changes
            </Button>
            <Button
              color="primary"
              isLoading={busy}
              onPress={async () => {
                if (await save()) onClose();
                else setPrompt("");
              }}
            >
              Save and close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={prompt === "share"} onClose={() => setPrompt("")}>
        <ModalContent>
          <ModalHeader>Your form is live</ModalHeader>
          <ModalBody>
            <p>Share this link. Answers are saved as people fill in the form, even if they do not finish.</p>
            <div className="share-link">
              <Field label="Form link" value={link} readOnly />
              <Button
                color="primary"
                startContent={<Copy size={16} />}
                onPress={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button as="a" href={link} target="_blank" variant="light" endContent={<ArrowUpRight size={16} />}>
              Open form
            </Button>
            <Button onPress={() => setPrompt("")}>Done</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function BlockRow({
  block,
  number,
  selected,
  warning,
  locked,
  first,
  last,
  onSelect,
  onAction,
}: {
  block: FormBlock;
  number: number;
  selected: boolean;
  warning: boolean;
  locked: boolean;
  first: boolean;
  last: boolean;
  onSelect: () => void;
  onAction: (action: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver, active } =
    useSortable({ id: block.id, disabled: locked });
  const Icon = typeIcons[block.type];
  const inserting = isOver && String(active?.id).startsWith("new:");
  const jumps = !!block.next || block.options.some((o) => o.goto);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={"studio-row" + (selected ? " selected" : "") + (isDragging ? " dragging" : "") + (inserting ? " insert" : "")}
    >
      {locked ? (
        <span className="studio-grip" />
      ) : (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="studio-grip"
          aria-label={`Reorder ${block.title || "question"}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
      )}
      <button type="button" className="studio-row-main" onClick={onSelect}>
        <span className={"studio-chip g-" + groups[block.type]}>
          <Icon size={15} />
        </span>
        <span className="studio-row-text">
          <small>
            {number ? number + " · " : ""}
            {typeLabels[block.type]}
          </small>
          <strong>
            {block.title || "Untitled question"}
            {block.required && <span className="studio-required"> *</span>}
          </strong>
        </span>
      </button>
      {jumps && (
        <span className="studio-flag" title="Has logic jumps">
          <GitBranch size={14} />
        </span>
      )}
      {warning && <CircleAlert size={15} className="studio-warn" />}
      {!locked && (
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <button type="button" className="studio-x" aria-label={`Actions for ${block.title || "question"}`}>
              <EllipsisVertical size={16} />
            </button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Block actions"
            disabledKeys={[...(first ? ["up"] : []), ...(last ? ["down"] : [])]}
            onAction={(key) => onAction(String(key))}
          >
            <DropdownItem key="duplicate" startContent={<Copy size={15} />}>
              Duplicate
            </DropdownItem>
            <DropdownItem key="up">Move up</DropdownItem>
            <DropdownItem key="down">Move down</DropdownItem>
            <DropdownItem key="delete" color="danger" className="text-danger" startContent={<Trash2 size={15} />}>
              Delete
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </div>
  );
}

function EndZone({ empty, adding }: { empty: boolean; adding: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "blocks-end" });
  if (!empty && !adding) return <div ref={setNodeRef} />;
  return (
    <div ref={setNodeRef} className={"studio-drop" + (isOver ? " over" : "")}>
      {adding ? "Drop here to add it at the end" : "No questions yet. Choose a block below to add your first one."}
    </div>
  );
}

type Preset = (typeof blockPresets)[number];
function PaletteChip({ preset, className = "" }: { preset: Preset; className?: string }) {
  const Icon = presetIcons[preset.key];
  return (
    <div className={"studio-palette-item " + className}>
      <span className={"studio-chip g-" + (preset.key === "name" ? "contact" : groups[preset.type])}>
        <Icon size={15} />
      </span>
      {preset.label}
    </div>
  );
}
function PaletteItem({ preset, disabled, onAdd }: { preset: Preset; disabled: boolean; onAdd: () => void }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: "new:" + preset.key, disabled });
  const Icon = presetIcons[preset.key];
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={"studio-palette-item" + (isDragging ? " dragging" : "")}
      disabled={disabled}
      onClick={onAdd}
      // Only pointer dragging is wired up, so Enter and Space keep adding the block.
      onPointerDown={
        listeners?.onPointerDown as
          | React.PointerEventHandler<HTMLButtonElement>
          | undefined
      }
    >
      <span className={"studio-chip g-" + (preset.key === "name" ? "contact" : groups[preset.type])}>
        <Icon size={15} />
      </span>
      {preset.label}
    </button>
  );
}

function JumpSelect({
  label,
  value,
  targets,
  onChange,
}: {
  label: string;
  value: string;
  targets: Target[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      size="sm"
      variant="bordered"
      disallowEmptySelection
      selectedKeys={[targets.some((x) => x.value === value) ? value : "next"]}
      onChange={(e) => onChange(e.target.value === "next" ? "" : e.target.value)}
    >
      {targets.map((x) => (
        <SelectItem key={x.value}>{x.label}</SelectItem>
      ))}
    </Select>
  );
}

function OptionsEditor({
  block,
  onChange,
}: {
  block: FormBlock;
  onChange: (options: FormBlock["options"]) => void;
}) {
  const options = block.options;
  const list = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useEffect(() => {
    if (!focusId) return;
    list.current?.querySelector<HTMLInputElement>(`[data-option="${focusId}"] input`)?.focus();
    setFocusId("");
  }, [focusId]);
  function insert(after: number, labels: string[], base = options) {
    const made = labels.map((label) => ({ id: newId(), label, goto: "" }));
    const next = [...base.slice(0, after + 1), ...made, ...base.slice(after + 1)].slice(0, 50);
    onChange(next);
    const last = made.filter((m) => next.includes(m)).pop();
    if (last) setFocusId(last.id);
  }
  return (
    <div className="studio-options" ref={list}>
      <span className="studio-field-label">Answer options</span>
      <DndContext
        id={"options-" + block.id}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => {
          const from = options.findIndex((o) => o.id === e.active.id);
          const to = options.findIndex((o) => o.id === e.over?.id);
          if (from >= 0 && to >= 0 && from !== to) onChange(arrayMove(options, from, to));
        }}
      >
        <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          {options.map((o, i) => (
            <OptionRow
              key={o.id}
              option={o}
              onLabel={(label) => onChange(options.map((x) => (x.id === o.id ? { ...x, label } : x)))}
              onEnter={() => insert(i, [""])}
              onRemove={() => {
                onChange(options.filter((x) => x.id !== o.id));
                if (options[i - 1]) setFocusId(options[i - 1].id);
              }}
              // Pasting a list turns every line into its own option.
              onPaste={(lines) =>
                o.label
                  ? insert(i, lines)
                  : insert(i, lines.slice(1), options.map((x) => (x.id === o.id ? { ...x, label: lines[0] } : x)))
              }
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        size="sm"
        variant="light"
        color="primary"
        startContent={<Plus size={15} />}
        isDisabled={options.length >= 50}
        onPress={() => insert(options.length - 1, [""])}
      >
        Add option
      </Button>
    </div>
  );
}
function OptionRow({
  option,
  onLabel,
  onEnter,
  onRemove,
  onPaste,
}: {
  option: FormBlock["options"][number];
  onLabel: (label: string) => void;
  onEnter: () => void;
  onRemove: () => void;
  onPaste: (lines: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
  });
  return (
    <div
      ref={setNodeRef}
      data-option={option.id}
      className={"studio-option" + (isDragging ? " dragging" : "")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button type="button" ref={setActivatorNodeRef} className="studio-grip" aria-label="Reorder option" {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>
      <Input
        aria-label="Answer option"
        size="sm"
        variant="bordered"
        maxLength={200}
        placeholder="Option"
        value={option.label}
        onValueChange={onLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "Backspace" && !option.label) {
            e.preventDefault();
            onRemove();
          }
        }}
        onPaste={(e) => {
          const lines = e.clipboardData
            .getData("text")
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (lines.length > 1) {
            e.preventDefault();
            onPaste(lines);
          }
        }}
      />
      <button type="button" className="studio-x" aria-label="Remove option" onClick={onRemove}>
        <X size={15} />
      </button>
    </div>
  );
}

function ImageField({
  label,
  hint,
  value,
  wide = false,
  onUpload,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  wide?: boolean;
  onUpload: (file: File) => Promise<string>;
  onChange: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="studio-image">
      <span className="studio-field-label">{label}</span>
      {value && (
        <div className={"studio-image-preview" + (wide ? " wide" : "")}>
          <img src={value} alt="" />
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            onChange(await onUpload(file));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <div className="row wrap">
        <Button size="sm" variant="bordered" isLoading={busy} startContent={!busy && <ImagePlus size={15} />} onPress={() => input.current?.click()}>
          {value ? "Replace image" : "Upload image"}
        </Button>
        {value && (
          <Button size="sm" variant="light" color="danger" onPress={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <small className={error ? "" : "muted"} role={error ? "alert" : undefined} style={error ? { color: "#b91c1c" } : undefined}>
        {error || hint}
      </small>
    </div>
  );
}
