import { duplicateCandidates, normalizeDuplicate, duplicateSqlValue } from "./duplicates";
import { pool, transaction, fail, audit } from "./db";
import { rateLimit } from "./auth";
import { resolveFileAnswers } from "./form-files";
import {
  formDefinition,
  formStrings,
  readAnswer,
  responseSchema,
  walk,
  type StoredAnswer,
} from "./forms";

// Called on every answer a respondent gives, so a response exists even when the form is never submitted.
export async function saveResponse(company: any, form: any, input: unknown) {
  const b = responseSchema.parse(input);
  let def = formDefinition.parse(form.definition);
  const lang = def.settings.language;
  if (company.status !== "active")
    fail(409, "This company is inactive. This form is temporarily unavailable.");
  if (form.status !== "published")
    fail(409, formStrings[lang].closedMessage, { closed: true });
  if (b.complete)
    return transaction(async (db) => {
      // The company lock also serializes competing completions and settings changes.
      const currentCompany = (await db.query("SELECT status FROM companies WHERE id=$1 FOR UPDATE", [company.id])).rows[0];
      const currentForm = (await db.query("SELECT * FROM forms WHERE company_id=$1 AND id=$2", [company.id, form.id])).rows[0];
      if (!currentCompany || !currentForm) fail(404, "Form not found");
      def = formDefinition.parse(currentForm.definition);
      if (currentCompany.status !== "active" || currentForm.status !== "published") fail(409, "This form is no longer accepting responses.");
      // Serializes retries and double taps of the same submission.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        form.id + ":" + b.key,
      ]);
      const existing = (
        await db.query(
          "SELECT id,status,ending_id FROM form_responses WHERE form_id=$1 AND session_key=$2 FOR UPDATE",
          [form.id, b.key],
        )
      ).rows[0];
      if (existing?.status === "completed")
        return { status: "completed", ending: existing.ending_id };
      const { path, ending } = walk(def, b.answers);
      const answers: Record<string, StoredAnswer> = {};
      for (const id of path) {
        const block = def.blocks.find((x) => x.id === id)!;
        try {
          const a = readAnswer(block, b.answers[id], lang, true);
          if (a) answers[id] = a;
        } catch (e) {
          fail(400, (e as Error).message, { block: id });
        }
      }
      await resolveFileAnswers(db, form.id, b.key, answers);
      const rule = def.settings.duplicate_rule;
      const candidates = duplicateCandidates(rule, rule.fields.map(key => ({ key, type: answers[key]?.type ?? "text", value: normalizeDuplicate(answers[key]?.value, answers[key]?.type ?? "text") })));
      if (candidates.length) {
        const params: unknown[] = [form.id, b.key];
        const predicates = candidates.map(item => {
          params.push(item.key);
          const expression = `r.answers->$${params.length}->>'value'`;
          params.push(item.value);
          return `${duplicateSqlValue(expression, item.type)}=$${params.length}`;
        });
        if ((await db.query(`SELECT 1 FROM form_responses r WHERE r.form_id=$1 AND r.session_key<>$2 AND r.status='completed' AND (${predicates.join(rule.match === "all" ? " AND " : " OR ")}) LIMIT 1`, params)).rowCount) fail(409, rule.message);
      }
      const values = [
        JSON.stringify(answers),
        ending,
        path[path.length - 1] ?? "",
        currentForm.version,
      ];
      const row = existing
        ? (
            await db.query(
              "UPDATE form_responses SET answers=$1,ending_id=$2,position=$3,form_version=$4,status='completed',completed_at=now(),updated_at=now() WHERE id=$5 RETURNING id",
              [...values, existing.id],
            )
          ).rows[0]
        : (
            await db.query(
              "INSERT INTO form_responses(answers,ending_id,position,form_version,status,completed_at,company_id,form_id,session_key) VALUES($1,$2,$3,$4,'completed',now(),$5,$6,$7) RETURNING id",
              [...values, company.id, form.id, b.key],
            )
          ).rows[0];
      await audit(db, null, company.id, "form.response.completed", row.id);
      return { status: "completed", ending };
    });
  const set: Record<string, StoredAnswer> = {};
  const unset: string[] = [];
  for (const [id, raw] of Object.entries(b.answers)) {
    const block = def.blocks.find((x) => x.id === id);
    if (!block) continue;
    const a = readAnswer(block, raw, lang, false);
    if (a) set[id] = a;
    else unset.push(id);
  }
  await resolveFileAnswers(pool, form.id, b.key, set);
  const position = def.blocks.some((x) => x.id === b.position) ? b.position : "";
  const update = () =>
    pool.query(
      "UPDATE form_responses SET answers=(answers || $1::jsonb) - $2::text[],position=CASE WHEN $3='' THEN position ELSE $3 END,form_version=$4,updated_at=now() WHERE form_id=$5 AND session_key=$6 AND status='partial'",
      [JSON.stringify(set), unset, position, form.version, form.id, b.key],
    );
  if ((await update()).rowCount) return { status: "partial" };
  if (
    (
      await pool.query(
        "SELECT 1 FROM form_responses WHERE form_id=$1 AND session_key=$2",
        [form.id, b.key],
      )
    ).rowCount
  )
    fail(409, "This response has already been submitted.", { completed: true });
  // Opening a form without answering anything does not create a response.
  if (!Object.keys(set).length) return { status: "empty" };
  await rateLimit("form-start:" + form.id, 2000);
  const created = await pool.query(
    "INSERT INTO form_responses(company_id,form_id,session_key,form_version,answers,position) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(form_id,session_key) DO NOTHING",
    [company.id, form.id, b.key, form.version, JSON.stringify(set), position],
  );
  if (!created.rowCount) await update();
  return { status: "partial" };
}
