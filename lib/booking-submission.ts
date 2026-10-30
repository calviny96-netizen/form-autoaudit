import { z } from "zod";
import { bookingSchema } from "./schema";

export type BookingPayload = z.infer<typeof bookingSchema>;
export type SubmissionPhase = "idle" | "submitting" | "failed" | "uncertain" | "confirmed";
export type SubmissionState = {
  phase: SubmissionPhase;
  payload: BookingPayload | null;
  error: string;
  token: string | null;
};
export const initialSubmission: SubmissionState = { phase: "idle", payload: null, error: "", token: null };
export type SubmissionEvent =
  | { type: "start"; payload: BookingPayload }
  | { type: "failure"; message: string; uncertain: boolean }
  | { type: "confirmed"; token: string }
  | { type: "edit"; acknowledged: boolean };

export function submissionReducer(state: SubmissionState, event: SubmissionEvent): SubmissionState {
  switch (event.type) {
    case "start":
      if (state.phase === "submitting" || state.phase === "confirmed") return state;
      return { ...state, phase: "submitting", payload: state.payload ?? event.payload, error: "" };
    case "failure":
      return { ...state, phase: event.uncertain ? "uncertain" : "failed", error: event.message };
    case "confirmed":
      return { ...state, phase: "confirmed", token: event.token, error: "" };
    case "edit":
      // Unknown outcomes must be checked with the original request before editing.
      return state.phase === "failed" && event.acknowledged ? initialSubmission : state;
  }
}
export function submissionControls(state: SubmissionState) {
  return {
    editDisabled: state.phase !== "idle",
    confirmDisabled: state.phase === "submitting" || state.phase === "confirmed",
    warnBeforeLeaving: ["submitting", "failed", "uncertain"].includes(state.phase),
  };
}
export class BookingSubmissionError extends Error {
  constructor(message: string, public uncertain: boolean, public status?: number) {
    super(message);
    this.name = "BookingSubmissionError";
  }
}
export async function submitBooking(
  endpoint: string,
  payload: BookingPayload,
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ token: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let result: any;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok) {
      const uncertain = response.status >= 500 || response.status === 408;
      throw new BookingSubmissionError(
        typeof result?.error === "string" ? result.error : uncertain
          ? "We could not verify your booking. Check and retry with the same details."
          : "Your booking was not confirmed. Please review your details and try again.",
        uncertain, response.status,
      );
    }
    if (typeof result?.token !== "string" || !/^[a-f0-9]{64}$/.test(result.token))
      throw new BookingSubmissionError("The confirmation response was incomplete. Check and retry with the same details.", true);
    return { token: result.token };
  } catch (error) {
    if (error instanceof BookingSubmissionError) throw error;
    throw new BookingSubmissionError(controller.signal.aborted
      ? "The request took too long. Your booking may already have been saved. Check and retry with the same details."
      : "The connection was interrupted. Your booking may already have been saved. Check and retry with the same details.", true);
  } finally {
    clearTimeout(timeout);
  }
}

const STORAGE_PREFIX = "calendar:booking-attempt:";
export const attemptStorageKey = (company: string, calendar: string) => STORAGE_PREFIX + encodeURIComponent(company) + ":" + encodeURIComponent(calendar);
export function saveAttempt(key: string, state: SubmissionState) {
  try { sessionStorage.setItem(key, JSON.stringify({ version: 1, ...state })); } catch { /* Navigation warning still protects the active page when storage is unavailable. */ }
}
export function clearAttempt(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* Storage can be unavailable in private browsing. */ }
}
export function restoreAttempt(key: string): SubmissionState | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const payload = bookingSchema.safeParse(saved.payload);
    if (saved.version !== 1 || !payload.success) return null;
    if (saved.phase === "confirmed" && typeof saved.token === "string" && /^[a-f0-9]{64}$/.test(saved.token))
      return { phase: "confirmed", payload: payload.data, token: saved.token, error: "" };
    if (saved.phase === "failed")
      return { phase: "failed", payload: payload.data, token: null, error: typeof saved.error === "string" ? saved.error : "Your booking was not confirmed." };
    return { phase: "uncertain", payload: payload.data, token: null, error: "Your previous booking attempt was interrupted. Check and retry with the same details to verify its status." };
  } catch { return null; }
}
export function clearConfirmedAttempts(token: string) {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        const saved = JSON.parse(sessionStorage.getItem(key) || "null");
        if (saved?.version === 1 && saved.token === token) sessionStorage.removeItem(key);
      }
    }
  } catch { /* Confirmation remains available even when browser storage is unavailable. */ }
}
