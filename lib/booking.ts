import { duplicateSchema, defaultCalendarDuplicateRule, duplicateCandidates, normalizeDuplicate, duplicateSqlValue } from "./duplicates";
import { randomBytes } from "node:crypto";
import { bookingSchema, validateAnswers, validateStandardDetails } from "./schema";
import { transaction, fail, audit, type DB } from "./db";
import { token, hash } from "./auth";
async function lockCampaign(db: DB, cid: string, campaignId: string) {
  const company = (
    await db.query("SELECT * FROM companies WHERE id=$1 FOR UPDATE", [cid])
  ).rows[0];
  const campaign = (
    await db.query(
      "SELECT * FROM campaigns WHERE company_id=$1 AND id=$2 FOR UPDATE",
      [cid, campaignId],
    )
  ).rows[0];
  if (!company || !campaign) fail(404, "Calendar not found");
  return { company, campaign };
}
function canBook(company: any, campaign: any) {
  if (company.status !== "active") fail(409, "This company is inactive.");
  if (campaign.status !== "published") fail(409, "Booking is closed.");
  if (campaign.opens_at && new Date(campaign.opens_at) > new Date())
    fail(409, "Booking is not open yet.");
  if (campaign.closes_at && new Date(campaign.closes_at) < new Date())
    fail(409, "Booking is closed.");
}
async function available(
  db: DB,
  cid: string,
  campaignId: string,
  slotId: string,
) {
  const s = (
    await db.query(
      "SELECT * FROM interview_slots WHERE company_id=$1 AND campaign_id=$2 AND id=$3 FOR UPDATE",
      [cid, campaignId, slotId],
    )
  ).rows[0];
  if (!s) fail(404, "Time slot not found");
  if (s.status !== "open" || new Date(s.starts_at) <= new Date())
    fail(409, "This time is unavailable. Choose another time.");
  const n = (
    await db.query(
      "SELECT count(*)::int AS n FROM bookings WHERE slot_id=$1 AND status<>'cancelled'",
      [slotId],
    )
  ).rows[0].n;
  if (n >= s.capacity)
    fail(
      409,
      "This time slot has just filled up. Please choose another time.",
    );
  return s;
}
export async function createBooking(
  cid: string,
  campaignId: string,
  input: unknown,
) {
  const b = bookingSchema.parse(input);
  const requestHash = hash(
    JSON.stringify({
      ...b,
      answers: Object.fromEntries(
        Object.entries(b.answers).sort(([a], [b]) => a.localeCompare(b)),
      ),
    }),
  );
  return transaction(async (db) => {
    const { company, campaign } = await lockCampaign(db, cid, campaignId);
    const existing = (
      await db.query(
        "SELECT token,request_hash FROM bookings WHERE campaign_id=$1 AND idempotency_key=$2",
        [campaignId, b.idempotency_key],
      )
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash)
        fail(
          409,
          "Your request changed. Reload the form before trying again.",
        );
      return { token: existing.token };
    }
    canBook(company, campaign);
    const selectedSlot = await available(db, cid, campaignId, b.slot_id);
    let details;
    try { details = validateStandardDetails(b, campaign.standard_fields); }
    catch (e) { fail(400, (e as Error).message); }
    let answers;
    try {
      answers = validateAnswers(campaign.fields, b.answers);
    } catch (e) {
      fail(400, (e as Error).message);
    }
    const rule = duplicateSchema.parse(campaign.duplicate_rule ?? defaultCalendarDuplicateRule());
    const candidateValues = rule.fields.map(key => {
      if (key === "booking_date") return { key, type: "date", value: new Intl.DateTimeFormat("en-CA", { timeZone: campaign.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(selectedSlot.starts_at)) };
      if (["name", "email", "phone"].includes(key)) return { key, type: key === "phone" ? "phone" : "text", value: normalizeDuplicate(details[key as keyof typeof details], key === "phone" ? "phone" : "text") };
      const field = answers.find(f => "field:" + f.id === key);
      return { key, type: field?.type ?? "text", value: normalizeDuplicate(field?.value, field?.type ?? "text") };
    });
    const candidates = duplicateCandidates(rule, candidateValues);
    if (candidates.length) {
      const params: unknown[] = [campaignId];
      const predicates = candidates.map(item => {
        let expression: string;
        if (item.key === "booking_date") {
          params.push(campaign.timezone);
          expression = `to_char(s.starts_at AT TIME ZONE $${params.length},'YYYY-MM-DD')`;
        } else if (["name", "email", "phone"].includes(item.key)) expression = `b.${item.key}`;
        else {
          params.push(item.key.slice(6));
          expression = `(SELECT f->>'value' FROM jsonb_array_elements(b.answers) f WHERE f->>'id'=$${params.length} LIMIT 1)`;
        }
        params.push(item.value);
        return `${duplicateSqlValue(expression, item.type)}=$${params.length}`;
      });
      if ((await db.query(`SELECT 1 FROM bookings b JOIN interview_slots s ON s.id=b.slot_id WHERE b.campaign_id=$1 AND b.status<>'cancelled' AND (${predicates.join(rule.match === "all" ? " AND " : " OR ")}) LIMIT 1`, params)).rowCount)
        fail(409, rule.message);
    }
    const t = token();
    const row = (
      await db.query(
        "INSERT INTO bookings(company_id,campaign_id,slot_id,name,email,phone,code,token,idempotency_key,request_hash,form_version,answers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
        [
          cid,
          campaignId,
          b.slot_id,
          details.name,
          details.email,
          details.phone,
          "AA-" + randomBytes(8).toString("hex").toUpperCase(),
          t,
          b.idempotency_key,
          requestHash,
          campaign.form_version,
          JSON.stringify(answers),
        ],
      )
    ).rows[0];
    await audit(db, null, cid, "booking.created", row.id);
    return { token: t };
  });
}
export async function changeBooking(
  cid: string,
  id: string,
  data: { status?: string; slot_id?: string },
  actor: string,
) {
  return transaction(async (db) => {
    const initial = (
      await db.query(
        "SELECT campaign_id FROM bookings WHERE company_id=$1 AND id=$2",
        [cid, id],
      )
    ).rows[0];
    if (!initial) fail(404, "Booking not found");
    const { company, campaign } = await lockCampaign(
      db,
      cid,
      initial.campaign_id,
    );
    const b = (
      await db.query(
        "SELECT * FROM bookings WHERE company_id=$1 AND id=$2 FOR UPDATE",
        [cid, id],
      )
    ).rows[0];
    if (data.slot_id && data.slot_id !== b.slot_id) {
      if (b.status === "cancelled") fail(409, "This booking has been cancelled");
      canBook(company, campaign);
      await available(db, cid, b.campaign_id, data.slot_id);
      await db.query("UPDATE bookings SET slot_id=$1 WHERE id=$2", [
        data.slot_id,
        id,
      ]);
    }
    if (data.status) {
      if (b.status === "cancelled" && data.status !== "cancelled")
        fail(409, "Cancelled bookings cannot be reactivated");
      await db.query("UPDATE bookings SET status=$1 WHERE id=$2", [
        data.status,
        id,
      ]);
    }
    await audit(db, actor, cid, "booking.updated", id);
    return { ok: true };
  });
}
