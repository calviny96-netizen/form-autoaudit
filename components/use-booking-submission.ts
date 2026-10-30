"use client";
import { useEffect, useRef, useState } from "react";
import { bookingSchema, validationMessage } from "@/lib/schema";
import { attemptStorageKey, BookingSubmissionError, clearAttempt, initialSubmission, restoreAttempt, saveAttempt, submissionControls, submissionReducer, submitBooking, type SubmissionState, type BookingPayload } from "@/lib/booking-submission";

export function useBookingSubmission(company: string, calendar: string) {
  const storageKey = attemptStorageKey(company, calendar);
  const [state, setState] = useState<SubmissionState>(initialSubmission);
  const [restoredPayload, setRestoredPayload] = useState<BookingPayload | null>(null);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const allowNavigation = useRef(false);
  function publish(next: SubmissionState) { stateRef.current = next; setState(next); }
  useEffect(() => {
    generation.current++;
    allowNavigation.current = false;
    const saved = restoreAttempt(storageKey);
    publish(saved ?? initialSubmission);
    setRestoredPayload(saved?.payload ?? null);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowNavigation.current && submissionControls(stateRef.current).warnBeforeLeaving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { generation.current++; window.removeEventListener("beforeunload", beforeUnload); };
  }, [storageKey]);

  async function confirm(input: unknown) {
    const current = stateRef.current;
    if (submissionControls(current).confirmDisabled) return;
    let payload: BookingPayload;
    try { payload = current.payload ?? bookingSchema.parse(input); }
    catch (error) { publish(submissionReducer(current, { type: "failure", message: validationMessage(error), uncertain: false })); return; }
    const started = submissionReducer(current, { type: "start", payload });
    publish(started); // The ref changes synchronously, preventing double submissions before React re-renders.
    saveAttempt(storageKey, started);
    const requestGeneration = generation.current;
    try {
      const result = await submitBooking(`/api/public/${company}/${calendar}`, started.payload!);
      const confirmed = submissionReducer(started, { type: "confirmed", token: result.token });
      saveAttempt(storageKey, confirmed);
      if (generation.current !== requestGeneration) return;
      publish(confirmed);
      allowNavigation.current = true;
      try { window.location.assign("/success/" + result.token); } catch { /* The confirmed state offers an explicit confirmation link. */ }
    } catch (error) {
      const failed = submissionReducer(started, { type: "failure", message: (error as Error).message, uncertain: error instanceof BookingSubmissionError ? error.uncertain : true });
      saveAttempt(storageKey, failed);
      if (generation.current === requestGeneration) publish(failed);
    }
  }
  function acknowledgeEdit() {
    const next = submissionReducer(stateRef.current, { type: "edit", acknowledged: true });
    if (next === stateRef.current) return false;
    clearAttempt(storageKey);
    publish(next);
    return true;
  }
  return {
    state, restoredPayload, confirm, acknowledgeEdit,
    ...submissionControls(state),
    canEdit: () => !submissionControls(stateRef.current).editDisabled,
    shouldWarn: () => !allowNavigation.current && submissionControls(stateRef.current).warnBeforeLeaving,
    allowLeave: () => { allowNavigation.current = true; },
  };
}
