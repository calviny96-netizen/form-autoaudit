"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Button, Input, Textarea, Select, SelectItem } from "@heroui/react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Lock, RotateCcw, Star } from "lucide-react";
import { api, Footer, Loading, Notice } from "./ui";
import { formIconMap } from "./form-icons";
import {
  formDefinition,
  formStrings,
  isEmptyAnswer,
  nextStep,
  readAnswer,
  scaleRange,
  walk,
  type Answers,
  type FormBlock,
  type FormDefinition,
  type FormStrings,
} from "@/lib/forms";
import "./form-runner.css";
import { UploadField, useUploadLeaveGuard } from "./form-upload";
import { validFormFile, fileAnswerSchema, type FileAnswer } from "@/lib/form-files-shared";

export type RunnerScreen =
  | { kind: "welcome" }
  | { kind: "block"; id: string }
  | { kind: "ending"; id: string };
type Progress = { answers: Answers; current: string; changed?: string };

function hsl(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map((n) => parseInt(n, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `${Math.round((h * 60 + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
// HeroUI reads its primary color from these variables, so its controls follow the form's color.
export function themeStyle(theme: FormDefinition["theme"]) {
  const primary = hsl(theme.primary);
  return {
    "--form-primary": theme.primary,
    "--form-bg": theme.background,
    "--heroui-primary": primary,
    "--heroui-primary-400": primary,
    "--heroui-primary-500": primary,
    "--heroui-primary-600": primary,
    "--heroui-primary-700": primary,
    "--heroui-focus": primary,
  } as React.CSSProperties;
}

export function FormRunner({
  definition: def,
  title,
  company,
  embedded = false,
  focus,
  restored,
  notice,
  onProgress,
  onSubmit,
  onRestart,
  onUpload,
}: {
  definition: FormDefinition;
  title: string;
  company: { name: string; branding?: any };
  embedded?: boolean;
  focus?: RunnerScreen;
  restored?: { answers: Answers; current: string } | null;
  notice?: React.ReactNode;
  onProgress?: (state: Progress) => void;
  onSubmit?: (answers: Answers) => Promise<{ ending: string }>;
  onRestart?: () => void;
  onUpload?: (block: FormBlock, file: File, progress: (percent: number) => void, signal: AbortSignal) => Promise<FileAnswer>;
}) {
  const lang = def.settings.language;
  const t = formStrings[lang];
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = (): RunnerScreen =>
    def.welcome.enabled
      ? { kind: "welcome" }
      : def.blocks[0]
        ? { kind: "block", id: def.blocks[0].id }
        : { kind: "ending", id: def.endings[0].id };
  const [answers, setAnswers] = useState<Answers>(restored?.answers ?? {});
  const [chosen, setScreen] = useState<RunnerScreen>(() =>
    restored?.current ? { kind: "block", id: restored.current } : (focus ?? first()),
  );
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [upload, setUpload] = useState<{ blockId: string; name: string; percent: number }>();
  const transfer = useRef<AbortController | null>(null);
  const cancelUpload = () => { transfer.current?.abort(); transfer.current = null; setUpload(undefined); };
  useUploadLeaveGuard(!!upload, t.fileLeave, cancelUpload);
  useEffect(() => () => { clearTimeout(timer.current); transfer.current?.abort(); }, []);
  async function selectFile(target: FormBlock, file: File) {
    if (!onUpload || transfer.current) return;
    if (!validFormFile(file.name, file.size)) return setError(t.fileInvalid);
    const controller = new AbortController();
    transfer.current = controller;
    setError("");
    setUpload({ blockId: target.id, name: file.name, percent: 0 });
    try {
      const result = await onUpload(target, file, percent => {
        if (transfer.current === controller) setUpload({ blockId: target.id, name: file.name, percent });
      }, controller.signal);
      if (transfer.current === controller) change(target, result);
    } catch (e) {
      if (transfer.current === controller && !controller.signal.aborted) setError((e as Error).message || t.fileFailed);
    } finally {
      if (transfer.current === controller) { transfer.current = null; setUpload(undefined); }
    }
  }
  // In the builder preview, the screen on display can be removed or switched off while it is shown.
  const screen: RunnerScreen =
    (chosen.kind === "block" && !def.blocks.some((b) => b.id === chosen.id)) ||
    (chosen.kind === "ending" && !def.endings.some((e) => e.id === chosen.id)) ||
    (chosen.kind === "welcome" && !def.welcome.enabled)
      ? first()
      : chosen;
  const block = screen.kind === "block" ? def.blocks.find((b) => b.id === screen.id) : undefined;
  const ending = screen.kind === "ending" ? def.endings.find((e) => e.id === screen.id) : undefined;
  const index = block ? def.blocks.indexOf(block) : -1;
  const path = useMemo(() => walk(def, answers).path, [def, answers]);
  const screenKey = screen.kind + ("id" in screen ? screen.id : "");
  const focusKey = focus ? focus.kind + ("id" in focus ? focus.id : "") : "";
  useEffect(() => {
    if (!focus) return;
    clearTimeout(timer.current);
    setDirection(1);
    setError("");
    setScreen(focus);
  }, [focusKey]);
  useEffect(() => {
    clearTimeout(timer.current);
    if (embedded) root.current?.parentElement?.scrollTo?.({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [screenKey]);
  function go(next: RunnerScreen, dir: number) {
    setDirection(dir);
    setError("");
    setScreen(next);
  }
  async function finish(current: Answers, endingId: string) {
    if (!onSubmit) return go({ kind: "ending", id: endingId }, 1);
    setSending(true);
    setError("");
    try {
      const result = await onSubmit(current);
      go({ kind: "ending", id: def.endings.some((e) => e.id === result.ending) ? result.ending : endingId }, 1);
    } catch (e) {
      const failed = (e as { block?: string }).block;
      if (failed && def.blocks.some((b) => b.id === failed)) {
        setDirection(-1);
        setScreen({ kind: "block", id: failed });
      }
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  function advance(from: FormBlock, current = answers) {
    if (sending || transfer.current) return;
    try {
      readAnswer(from, current[from.id], lang, true);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const step = nextStep(def, from.id, current);
    if ("ending" in step) return void finish(current, step.ending);
    go({ kind: "block", id: step.block }, 1);
    onProgress?.({ answers: current, current: step.block });
  }
  function start() {
    if (!def.blocks[0]) return void finish(answers, def.endings[0].id);
    go({ kind: "block", id: def.blocks[0].id }, 1);
    onProgress?.({ answers, current: def.blocks[0].id });
  }
  function back() {
    if (!block || sending) return;
    if (transfer.current) { if (!window.confirm(t.fileLeave)) return; cancelUpload(); }
    const at = path.indexOf(block.id);
    const previous = at > 0 ? path[at - 1] : embedded && at < 0 && index > 0 ? def.blocks[index - 1].id : "";
    if (previous) {
      go({ kind: "block", id: previous }, -1);
      onProgress?.({ answers, current: previous });
    } else if (def.welcome.enabled) go({ kind: "welcome" }, -1);
  }
  function change(target: FormBlock, value: unknown, auto = false) {
    const next = { ...answers, [target.id]: value };
    setAnswers(next);
    setError("");
    onProgress?.({ answers: next, current: target.id, changed: target.id });
    clearTimeout(timer.current);
    // A short pause lets the respondent see their choice before the next question slides in.
    if (auto && !isEmptyAnswer(value)) timer.current = setTimeout(() => advance(target, next), 320);
  }
  function toggle(target: FormBlock, optionId: string) {
    const picked = Array.isArray(answers[target.id]) ? (answers[target.id] as string[]) : [];
    if (!picked.includes(optionId) && target.max !== undefined && picked.length >= target.max)
      return setError(t.maxChoices(target.max));
    change(target, picked.includes(optionId) ? picked.filter((x) => x !== optionId) : [...picked, optionId]);
  }
  function restart() {
    setAnswers({});
    go(first(), -1);
    onRestart?.();
  }
  useEffect(() => {
    if (embedded || screen.kind === "ending") return;
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        if (target.closest("input,textarea,button,a,[role=listbox],[role=option]")) return;
        e.preventDefault();
        return block ? advance(block) : start();
      }
      if (!block || target.closest("input,textarea,select,[role=listbox]")) return;
      if (block.type === "choice" || block.type === "multi") {
        const o = e.key.length === 1 ? block.options[e.key.toUpperCase().charCodeAt(0) - 65] : undefined;
        if (!o) return;
        e.preventDefault();
        if (block.type === "choice") change(block, o.id, true);
        else toggle(block, o.id);
      } else if ((block.type === "rating" || block.type === "scale") && /^\d$/.test(e.key)) {
        const [lo, hi] = scaleRange(block);
        if (Number(e.key) >= lo && Number(e.key) <= hi) change(block, Number(e.key), true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const logo =
    def.theme.logo_mode === "custom" ? def.theme.logo : (company.branding?.logo ?? "");
  const banner =
    def.theme.banner && (screen.kind === "welcome" || def.theme.banner_scope === "all")
      ? def.theme.banner
      : "";
  const percent =
    screen.kind === "ending" ? 100 : block ? Math.round((index / def.blocks.length) * 100) : 0;
  const number =
    block && block.type !== "statement"
      ? def.blocks.slice(0, index + 1).filter((b) => b.type !== "statement").length
      : 0;
  const last = !!block && "ending" in nextStep(def, block.id, answers);
  const canBack =
    !!block && (path.indexOf(block.id) > 0 || def.welcome.enabled || (embedded && index > 0));
  const EndingIcon = ending ? formIconMap[ending.icon] : null;
  return (
    <div ref={root} className={"runner" + (embedded ? " embedded" : "")} style={themeStyle(def.theme)}>
      {def.settings.progress && (
        <div
          className="runner-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={number ? t.question(number, def.blocks.filter((b) => b.type !== "statement").length) : title}
        >
          <i style={{ width: percent + "%" }} />
        </div>
      )}
      {def.theme.logo_mode !== "none" && (
        <header className="runner-top">
          <div className="runner-brand">
            {logo ? (
              <img src={logo} alt={company.name} />
            ) : (
              <>
                <div className="company-monogram">{company.name.slice(0, 1)}</div>
                <strong>{company.name}</strong>
              </>
            )}
          </div>
        </header>
      )}
      {notice}
      {banner && (
        <div className={"runner-banner" + (screen.kind === "welcome" ? "" : " slim")}>
          <img src={banner} alt="" />
        </div>
      )}
      <main className="runner-stage">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <Slide key={screenKey} direction={direction} reduced={!!reduced} autoFocus={!embedded}>
            {screen.kind === "welcome" ? (
              <div className="runner-welcome">
                <h1>{def.welcome.title || title}</h1>
                {def.welcome.description && <p className="runner-desc">{def.welcome.description}</p>}
                <div className="runner-actions">
                  <Button color="primary" size="lg" endContent={<ArrowRight size={18} />} onPress={start}>
                    {def.welcome.button || t.start}
                  </Button>
                  <span className="runner-hint runner-enter">{t.enter}</span>
                </div>
              </div>
            ) : block ? (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  advance(block);
                }}
              >
                <div className="runner-q">
                  {def.settings.numbers && number > 0 && (
                    <span className="runner-num">
                      {number} <ArrowRight size={14} />
                    </span>
                  )}
                  <h1 id={"q-" + block.id}>
                    {block.title}
                    {block.required && (
                      <span className="runner-req" title={t.requiredMark}>
                        {" "}
                        *
                      </span>
                    )}
                  </h1>
                  {block.description && <p className="runner-desc">{block.description}</p>}
                </div>
                {block.type !== "statement" && (
                  <div className="runner-field">
                    {block.type === "file_upload" ? <UploadField
                      id={block.id} value={answers[block.id]} t={t} embedded={embedded}
                      upload={upload?.blockId === block.id ? upload : undefined}
                      onSelect={file => void selectFile(block, file)} onCancel={cancelUpload}
                    /> : <BlockField
                      block={block}
                      value={answers[block.id]}
                      t={t}
                      onChange={(value, auto) => change(block, value, auto)}
                      onToggle={(optionId) => toggle(block, optionId)}
                      onEnter={() => advance(block)}
                    />}
                  </div>
                )}
                {error && (
                  <div className="runner-error" role="alert">
                    <CircleAlert size={17} />
                    {error}
                  </div>
                )}
                <div className="runner-actions">
                  <Button
                    type="submit"
                    color="primary"
                    size="lg"
                    isLoading={sending}
                    isDisabled={!!upload}
                    endContent={!sending && (last ? <Check size={18} /> : <ArrowRight size={18} />)}
                  >
                    {sending ? t.sending : last ? def.settings.submit_label || t.submit : t.next}
                  </Button>
                  {block.type !== "long_text" && block.type !== "file_upload" && !sending && (
                    <span className="runner-hint runner-enter">{t.enter}</span>
                  )}
                </div>
              </form>
            ) : ending ? (
              <div className="runner-ending">
                {ending.media === "image" && ending.image ? (
                  <img className="runner-ending-image" src={ending.image} alt="" />
                ) : (
                  ending.media === "icon" &&
                  EndingIcon && (
                    <motion.div
                      className="runner-ending-icon"
                      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
                    >
                      <EndingIcon size={38} />
                    </motion.div>
                  )
                )}
                <h1>{ending.title || t.thanksTitle}</h1>
                {ending.message && <p className="runner-desc">{ending.message}</p>}
                {(ending.buttons.length > 0 || ending.restart) && (
                  <div className="runner-ending-actions">
                    {ending.buttons.map((b) => {
                      const Icon = b.icon ? formIconMap[b.icon] : null;
                      return (
                        <Button
                          key={b.id}
                          // The builder preview shows link buttons without leaving the builder.
                          {...(embedded
                            ? {}
                            : {
                                as: "a" as const,
                                href: b.url,
                                target: b.new_tab ? "_blank" : undefined,
                                rel: "noopener noreferrer",
                              })}
                          size="lg"
                          color="primary"
                          variant={b.style === "primary" ? "solid" : b.style === "outline" ? "bordered" : "light"}
                          startContent={Icon && <Icon size={18} />}
                        >
                          {b.label}
                        </Button>
                      );
                    })}
                    {ending.restart && (
                      <Button variant="light" size="lg" startContent={<RotateCcw size={17} />} onPress={restart}>
                        {ending.restart_label || t.restart}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </Slide>
        </AnimatePresence>
      </main>
      <div className="runner-foot">
        {canBack ? (
          <Button variant="light" size="sm" isDisabled={sending} startContent={<ArrowLeft size={16} />} onPress={back}>
            {t.back}
          </Button>
        ) : (
          <span />
        )}
        <Footer config={company.branding?.footer} />
      </div>
    </div>
  );
}

// The outgoing screen stays mounted while it fades; inert keeps late taps from changing its answer.
function Slide({
  direction,
  reduced,
  autoFocus,
  children,
}: {
  direction: number;
  reduced: boolean;
  autoFocus: boolean;
  children: React.ReactNode;
}) {
  const present = useIsPresent();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    // Touch keyboards cover half the screen, so only pointer devices get automatic focus.
    if (autoFocus && matchMedia("(pointer: fine)").matches)
      section.current
        ?.querySelector<HTMLElement>(".runner-field input, .runner-field textarea")
        ?.focus({ preventScroll: true });
  }, []);
  return (
    <motion.section
      ref={section}
      className="runner-screen"
      inert={!present}
      custom={direction}
      initial="enter"
      animate="center"
      exit="exit"
      variants={{
        enter: (d: number) => ({ opacity: 0, y: reduced ? 0 : d * 26 }),
        center: { opacity: 1, y: 0 },
        exit: (d: number) => ({ opacity: 0, y: reduced ? 0 : d * -26 }),
      }}
      transition={{ duration: reduced ? 0.01 : 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}

function BlockField({
  block,
  value,
  t,
  onChange,
  onToggle,
  onEnter,
}: {
  block: FormBlock;
  value: unknown;
  t: FormStrings;
  onChange: (value: unknown, auto?: boolean) => void;
  onToggle: (optionId: string) => void;
  onEnter: () => void;
}) {
  const input = {
    "aria-labelledby": "q-" + block.id,
    variant: "underlined" as const,
    size: "lg" as const,
    color: "primary" as const,
    value: String(value ?? ""),
    onValueChange: (v: string) => onChange(v),
    placeholder: block.placeholder || t.typeHere,
    classNames: { input: "text-[19px]", inputWrapper: "h-14" },
  };
  if (block.type === "choice" || block.type === "multi") {
    const picked = block.type === "multi" ? (Array.isArray(value) ? value : []) : [value];
    return (
      <>
        {block.type === "multi" && <p className="runner-hint runner-many">{t.chooseMany}</p>}
        <div
          className="runner-options"
          role={block.type === "multi" ? "group" : "radiogroup"}
          aria-labelledby={"q-" + block.id}
        >
          {block.options.map((o, i) => {
            const selected = picked.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role={block.type === "multi" ? "checkbox" : "radio"}
                aria-checked={selected}
                aria-label={o.label}
                className={"runner-option" + (selected ? " selected" : "")}
                onClick={() => (block.type === "multi" ? onToggle(o.id) : onChange(o.id, true))}
              >
                {i < 26 && <kbd>{String.fromCharCode(65 + i)}</kbd>}
                <span>{o.label}</span>
                {selected && <Check size={18} />}
              </button>
            );
          })}
        </div>
      </>
    );
  }
  if (block.type === "dropdown")
    return (
      <Select
        aria-labelledby={"q-" + block.id}
        variant="bordered"
        size="lg"
        placeholder={block.placeholder || t.select}
        selectedKeys={value ? [String(value)] : []}
        onSelectionChange={(keys) => onChange(keys === "all" ? "" : String(Array.from(keys)[0] ?? ""))}
        classNames={{ trigger: "bg-white min-h-14", value: "text-[17px]" }}
      >
        {block.options.map((o) => (
          <SelectItem key={o.id}>{o.label}</SelectItem>
        ))}
      </Select>
    );
  if (block.type === "rating" || block.type === "scale") {
    const [lo, hi] = scaleRange(block);
    const steps = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const current = isEmptyAnswer(value) ? null : Number(value);
    return block.type === "rating" ? (
      <div className="runner-rating" role="radiogroup" aria-labelledby={"q-" + block.id}>
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            aria-label={String(n)}
            className={current !== null && n <= current ? "on" : ""}
            onClick={() => onChange(n, true)}
          >
            <Star size={32} />
          </button>
        ))}
      </div>
    ) : (
      <>
        <div
          className="runner-scale"
          role="radiogroup"
          aria-labelledby={"q-" + block.id}
          style={{ "--steps": steps.length } as React.CSSProperties}
        >
          {steps.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={current === n}
              className={current === n ? "selected" : ""}
              onClick={() => onChange(n, true)}
            >
              {n}
            </button>
          ))}
        </div>
        {(block.low || block.high) && (
          <div className="runner-scale-labels">
            <span>{block.low}</span>
            <span>{block.high}</span>
          </div>
        )}
      </>
    );
  }
  if (block.type === "long_text")
    return (
      <Textarea
        {...input}
        minRows={2}
        maxRows={8}
        maxLength={Math.min(block.max ?? 5000, 5000)}
        classNames={{ input: "text-[18px]" }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    );
  if (block.type === "email")
    return <Input {...input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder={block.placeholder || "name@example.com"} />;
  if (block.type === "phone")
    return <Input {...input} type="tel" inputMode="tel" autoComplete="tel" />;
  if (block.type === "number")
    return <Input {...input} type="text" inputMode="decimal" />;
  if (block.type === "date") return <Input {...input} type="date" placeholder=" " />;
  return <Input {...input} maxLength={Math.min(block.max ?? 500, 500)} />;
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
function remember(key: string, value: { key: string; answers: Answers; current: string }) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: 1, at: Date.now(), ...value }));
  } catch {
    /* Answers still reach the server when browser storage is unavailable. */
  }
}
function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
}
// Returning respondents continue the same response instead of starting a second partial one.
function recall(key: string, def: FormDefinition) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved?.v !== 1 || Date.now() - saved.at > WEEK || !/^[0-9a-f-]{36}$/.test(saved.key)) return null;
    const answers: Answers = {};
    for (const b of def.blocks) if (!isEmptyAnswer(saved.answers?.[b.id])) answers[b.id] = saved.answers[b.id];
    if (!Object.keys(answers).length) return null;
    const { path } = walk(def, answers);
    const current = path.includes(saved.current)
      ? saved.current
      : (path.find((id) => isEmptyAnswer(answers[id])) ?? path[path.length - 1]);
    return { key: saved.key as string, answers, current: current as string };
  } catch {
    return null;
  }
}

export function PublicForm({ company, form }: { company: string; form: string }) {
  const [data, setData] = useState<{ company: any; form: any; definition: FormDefinition }>();
  const [session, setSession] = useState<{ id: number; restored: ReturnType<typeof recall> }>();
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  const [resumed, setResumed] = useState(false);
  const storageKey = `forms:progress:${company}/${form}`;
  const endpoint = `/api/public-forms/${company}/${form}`;
  const sync = useRef({
    key: "",
    answers: {} as Answers,
    position: "",
    sent: "",
    dirty: new Set<string>(),
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    busy: null as Promise<void> | null,
    stopped: false,
  });
  useEffect(() => {
    api(`public-forms/${company}/${form}`)
      .then((result) => {
        const definition = formDefinition.parse(result.form.definition);
        const restored = recall(storageKey, definition);
        const s = sync.current;
        s.key = restored?.key ?? crypto.randomUUID();
        s.answers = restored?.answers ?? {};
        s.position = s.sent = restored?.current ?? "";
        document.title = result.form.title;
        setData({ ...result, definition });
        setClosed(result.form.status !== "published");
        setResumed(!!restored);
        setSession({ id: 0, restored });
      })
      .catch((e) => setError(e.message));
    return () => clearTimeout(sync.current.timer);
  }, [company, form]);
  async function post(payload: unknown, keepalive = false) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive,
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(Error(b.error ?? "Request failed"), b, { status: r.status });
    return b;
  }
  const plain = (value: unknown) =>
    typeof value === "number" || Array.isArray(value) || fileAnswerSchema.safeParse(value).success ? value : isEmptyAnswer(value) ? null : String(value);
  function take() {
    const s = sync.current;
    if (!s.dirty.size && s.position === s.sent) return null;
    const ids = [...s.dirty];
    s.dirty.clear();
    s.sent = s.position;
    return { ids, payload: { key: s.key, position: s.position, answers: Object.fromEntries(ids.map((id) => [id, plain(s.answers[id])])) } };
  }
  const schedule = (delay: number) => {
    clearTimeout(sync.current.timer);
    sync.current.timer = setTimeout(flush, delay);
  };
  // One request at a time keeps answers arriving in the order they were given.
  function flush() {
    const s = sync.current;
    if (s.stopped || s.busy) return;
    const next = take();
    if (!next) return;
    s.busy = post(next.payload)
      .then(
        () => 400,
        (e) => {
          if (e.closed || e.status === 404) {
            s.stopped = true;
            setClosed(true);
          } else if (e.completed) {
            // This response was already submitted elsewhere; continue as a new one.
            s.key = crypto.randomUUID();
            Object.keys(s.answers).forEach((id) => s.dirty.add(id));
          } else {
            // Offline or a server error: keep the answers queued and try again shortly.
            next.ids.forEach((id) => s.dirty.add(id));
            s.sent = "";
            return 6000;
          }
          return 400;
        },
      )
      .then((delay) => {
        s.busy = null;
        if (!s.stopped && (s.dirty.size || s.position !== s.sent)) schedule(delay);
      });
  }
  useEffect(() => {
    const leave = () => {
      const s = sync.current;
      if (document.visibilityState !== "hidden" || s.stopped || s.busy) return;
      const next = take();
      if (next) post(next.payload, true).catch(() => next.ids.forEach((id) => s.dirty.add(id)));
    };
    document.addEventListener("visibilitychange", leave);
    return () => document.removeEventListener("visibilitychange", leave);
  }, [endpoint]);
  if (!data || !session)
    return (
      <div className="public-state">
        <Notice text={error} />
        {!error && <Loading label="Loading form" />}
        {error && <Footer />}
      </div>
    );
  const t = formStrings[data.definition.settings.language];
  if (closed)
    return (
      <div className="runner" style={themeStyle(data.definition.theme)}>
        <main className="runner-stage">
          <div className="runner-ending">
            <div className="runner-ending-icon">
              <Lock size={34} />
            </div>
            <h1>{t.closedTitle}</h1>
            <p className="runner-desc">{t.closedMessage}</p>
          </div>
        </main>
        <div className="runner-foot">
          <span />
          <Footer config={data.company.branding?.footer} />
        </div>
      </div>
    );
  const reset = () => {
    const s = sync.current;
    clearTimeout(s.timer);
    forget(storageKey);
    Object.assign(s, { key: crypto.randomUUID(), answers: {}, position: "", sent: "", stopped: false });
    s.dirty.clear();
    setResumed(false);
  };
  return (
    <FormRunner
      key={session.id}
      definition={data.definition}
      title={data.form.title}
      company={data.company}
      restored={session.restored}
      notice={
        resumed && (
          <div className="runner-notice" role="status">
            <span>{t.resumed}</span>
            <button
              type="button"
              onClick={() => {
                reset();
                setSession({ id: session.id + 1, restored: null });
              }}
            >
              {t.startOver}
            </button>
          </div>
        )
      }
      onProgress={(state) => {
        const s = sync.current;
        s.answers = state.answers;
        s.position = state.current;
        remember(storageKey, { key: s.key, answers: state.answers, current: state.current });
        if (state.changed) s.dirty.add(state.changed);
        // Typing waits for a pause; moving to another question saves immediately.
        schedule(state.changed ? 900 : 0);
        if (resumed && !state.changed) setResumed(false);
      }}
      onSubmit={async (answers) => {
        const s = sync.current;
        clearTimeout(s.timer);
        if (s.busy) await s.busy;
        clearTimeout(s.timer);
        s.dirty.clear();
        try {
          const result = await post({
            key: s.key,
            complete: true,
            answers: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, plain(value)])),
          });
          s.stopped = true;
          forget(storageKey);
          return result;
        } catch (e) {
          if ((e as { closed?: boolean }).closed) setClosed(true);
          if ((e as { status?: number }).status === undefined) throw Error(t.sendFailed);
          throw e;
        }
      }}
      onUpload={(block, file, progress, signal) => new Promise<FileAnswer>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const params = new URLSearchParams({ key: sync.current.key, block: block.id, name: file.name, upload: crypto.randomUUID() });
        const abort = () => xhr.abort();
        const cleanup = () => signal.removeEventListener("abort", abort);
        xhr.open("POST", `${endpoint}/files?${params}`);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.timeout = 125000;
        xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => {
          cleanup();
          let body: any;
          try { body = JSON.parse(xhr.responseText); } catch { return reject(Error(t.fileFailed)); }
          if (xhr.status < 200 || xhr.status >= 300) return reject(Error(body.error || t.fileFailed));
          const result = fileAnswerSchema.safeParse(body);
          result.success ? resolve(result.data) : reject(Error(t.fileFailed));
        };
        xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(Error(t.fileFailed)); };
        xhr.onabort = () => { cleanup(); reject(new DOMException("Upload cancelled", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) { cleanup(); return reject(new DOMException("Upload cancelled", "AbortError")); }
        xhr.send(file);
      })}
      onRestart={reset}
    />
  );
}
