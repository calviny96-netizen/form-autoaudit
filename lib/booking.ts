import { randomBytes } from "node:crypto";
import { bookingSchema, validateAnswers } from "./schema";
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
  if (!company || !campaign) fail(404, "Gelombang tidak ditemukan");
  return { company, campaign };
}
function canBook(company: any, campaign: any) {
  if (company.status !== "active") fail(409, "Company sedang tidak aktif.");
  if (campaign.status !== "published") fail(409, "Pendaftaran ditutup.");
  if (campaign.opens_at && new Date(campaign.opens_at) > new Date())
    fail(409, "Pendaftaran belum dibuka.");
  if (campaign.closes_at && new Date(campaign.closes_at) < new Date())
    fail(409, "Pendaftaran ditutup.");
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
  if (!s) fail(404, "Slot tidak ditemukan");
  if (s.status !== "open" || new Date(s.starts_at) <= new Date())
    fail(409, "Jadwal tidak tersedia. Pilih jadwal lain.");
  const n = (
    await db.query(
      "SELECT count(*)::int AS n FROM bookings WHERE slot_id=$1 AND status<>'cancelled'",
      [slotId],
    )
  ).rows[0].n;
  if (n >= s.capacity)
    fail(
      409,
      "Maaf, kursi terakhir baru saja terisi. Silakan pilih jadwal lain.",
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
          "Permintaan berubah. Muat ulang formulir sebelum mencoba kembali.",
        );
      return { token: existing.token };
    }
    canBook(company, campaign);
    await available(db, cid, campaignId, b.slot_id);
    if (
      (
        await db.query(
          "SELECT 1 FROM bookings WHERE campaign_id=$1 AND email=$2 AND status<>'cancelled'",
          [campaignId, b.email],
        )
      ).rowCount
    )
      fail(
        409,
        "Email ini sudah memiliki pendaftaran aktif pada gelombang ini.",
      );
    let answers;
    try {
      answers = validateAnswers(campaign.fields, b.answers);
    } catch (e) {
      fail(400, (e as Error).message);
    }
    const t = token();
    const row = (
      await db.query(
        "INSERT INTO bookings(company_id,campaign_id,slot_id,name,email,phone,code,token,idempotency_key,request_hash,form_version,answers) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
        [
          cid,
          campaignId,
          b.slot_id,
          b.name,
          b.email,
          b.phone,
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
    if (!initial) fail(404, "Booking tidak ditemukan");
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
      if (b.status === "cancelled") fail(409, "Booking sudah dibatalkan");
      canBook(company, campaign);
      await available(db, cid, b.campaign_id, data.slot_id);
      await db.query("UPDATE bookings SET slot_id=$1 WHERE id=$2", [
        data.slot_id,
        id,
      ]);
    }
    if (data.status) {
      if (b.status === "cancelled" && data.status !== "cancelled")
        fail(409, "Booking yang dibatalkan tidak dapat diaktifkan kembali");
      await db.query("UPDATE bookings SET status=$1 WHERE id=$2", [
        data.status,
        id,
      ]);
    }
    await audit(db, actor, cid, "booking.updated", id);
    return { ok: true };
  });
}
