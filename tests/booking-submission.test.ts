import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BookingSubmissionError, initialSubmission, submissionReducer, submissionControls, submitBooking, attemptStorageKey, saveAttempt, restoreAttempt, clearAttempt, type BookingPayload } from "../lib/booking-submission";

const payload: BookingPayload = { slot_id: randomUUID(), idempotency_key: randomUUID(), name: "Test Customer", email: "booking-test@example.test", phone: "+628123456789", consent: true, answers: {} };
const token = "a".repeat(64);
test("submission locks editing immediately and prevents duplicate starts", () => {
  const pending = submissionReducer(initialSubmission, { type: "start", payload });
  assert.deepEqual(submissionControls(pending), { editDisabled: true, confirmDisabled: true, warnBeforeLeaving: true });
  assert.equal(submissionReducer(pending, { type: "start", payload: { ...payload, name: "Changed" } }), pending);
});
test("failed requests require explicit acknowledgement to edit; uncertain requests stay locked", () => {
  const pending = submissionReducer(initialSubmission, { type: "start", payload });
  const failed = submissionReducer(pending, { type: "failure", message: "Slot full", uncertain: false });
  assert.equal(submissionControls(failed).editDisabled, true);
  assert.equal(submissionControls(failed).warnBeforeLeaving, true);
  assert.equal(submissionReducer(failed, { type: "edit", acknowledged: false }), failed);
  assert.equal(submissionReducer(failed, { type: "edit", acknowledged: true }), initialSubmission);
  const uncertain = submissionReducer(pending, { type: "failure", message: "Connection lost", uncertain: true });
  assert.equal(submissionReducer(uncertain, { type: "edit", acknowledged: true }), uncertain);
  assert.equal(submissionReducer(uncertain, { type: "start", payload: { ...payload, idempotency_key: randomUUID() } }).payload, payload);
});
test("a successful confirmation unlocks safe navigation and blocks resubmission", () => {
  const confirmed = submissionReducer(submissionReducer(initialSubmission, { type: "start", payload }), { type: "confirmed", token });
  assert.deepEqual(submissionControls(confirmed), { editDisabled: true, confirmDisabled: true, warnBeforeLeaving: false });
});
test("server rejection preserves its message and allows deliberate recovery", async () => {
  await assert.rejects(submitBooking("/booking", payload, { fetcher: async () => new Response(JSON.stringify({ error: "This time slot is full." }), { status: 409 }) }), (error: unknown) => error instanceof BookingSubmissionError && !error.uncertain && error.status === 409 && error.message === "This time slot is full.");
});
test("server errors and malformed confirmations keep the outcome uncertain", async () => {
  for (const response of [new Response("Unavailable", { status: 503 }), new Response("{}"), new Response("invalid JSON")]) {
    await assert.rejects(submitBooking("/booking", payload, { fetcher: async () => response }), (error: unknown) => error instanceof BookingSubmissionError && error.uncertain);
  }
});
test("timeout stops waiting and warns that the booking may have been saved", async () => {
  await assert.rejects(submitBooking("/booking", payload, { timeoutMs: 10, fetcher: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))) }), (error: unknown) => error instanceof BookingSubmissionError && error.uncertain && error.message.includes("took too long"));
});
test("retry after a lost response sends exactly the original request", async () => {
  const bodies: string[] = [];
  let attempts = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(String(init?.body));
    if (++attempts === 1) throw new Error("Response lost after commit");
    return new Response(JSON.stringify({ token }));
  };
  await assert.rejects(submitBooking("/booking", payload, { fetcher }));
  assert.deepEqual(await submitBooking("/booking", payload, { fetcher }), { token });
  assert.equal(bodies[0], bodies[1]);
});
test("interrupted attempts restore locked details and the same retry identity", () => {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    setItem: (key: string, value: string) => storage.set(key, value),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    const key = attemptStorageKey("test-company", "test-calendar");
    saveAttempt(key, submissionReducer(initialSubmission, { type: "start", payload }));
    const restored = restoreAttempt(key)!;
    assert.equal(restored.phase, "uncertain");
    assert.equal(restored.payload!.idempotency_key, payload.idempotency_key);
    assert.equal(submissionControls(restored).editDisabled, true);
    assert.equal(submissionControls(restored).warnBeforeLeaving, true);
    clearAttempt(key);
    assert.equal(restoreAttempt(key), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
