import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { cleanupFormFiles } from "../lib/form-file-cleanup";
import { MAX_FORM_FILE_BYTES } from "../lib/form-files-shared";
import { unlink, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { pool } from "../lib/db";
import { handle } from "../lib/api";
import { hash, token } from "../lib/auth";
import { permissions } from "../lib/schema";
import { formDefinition, createBlock, createEnding, walk, canonical } from "../lib/forms";
import { buildTemplate } from "../lib/form-templates";
let cid: string, other: string, owner: string, viewer: string, session: string, viewSession: string, slug: string;
const ids: string[] = [], files: string[] = [];
const req = (route: string, method = "GET", data?: any, cookie = session) =>
  handle(
    new Request(process.env.APP_URL + "/api/" + route, {
      method,
      headers: data instanceof FormData
        ? { cookie: "aa_session=" + cookie, origin: new URL(process.env.APP_URL!).origin }
        : { cookie: "aa_session=" + cookie, "Content-Type": "application/json", origin: new URL(process.env.APP_URL!).origin },
      body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
    }),
    route.split("?")[0].split("/"),
  );
// Name → attend? (No ends early on a second ending) → guests → notes.
const registration = () => buildTemplate("registration", "en", "Launch party");
const create = async (definition: any, status = "published") => {
  const r = await req(`companies/${cid}/forms`, "POST", { title: "Launch party", slug: "party-" + randomUUID().slice(0, 8), status, definition });
  assert.equal(r.status, 200);
  return r.json();
};
const save = (form: any, data: any) => req(`public-forms/${slug}/${form.slug}`, "POST", data, "");
const stored = async (form: any, key: string) =>
  (await pool.query("SELECT * FROM form_responses WHERE form_id=$1 AND session_key=$2", [form.id, key])).rows;
before(async () => {
  for (const name of ["Forms Owner", "Forms Viewer"])
    ids.push((await pool.query("INSERT INTO users(email,name) VALUES($1,$2) RETURNING id", ["forms-" + randomUUID() + "@example.test", name])).rows[0].id);
  [owner, viewer] = ids;
  slug = "forms-" + randomUUID();
  cid = (await pool.query("INSERT INTO companies(name,slug) VALUES('Forms test',$1) RETURNING id", [slug])).rows[0].id;
  other = (await pool.query("INSERT INTO companies(name,slug) VALUES('Forms other',$1) RETURNING id", ["forms-" + randomUUID()])).rows[0].id;
  const role = (await pool.query("INSERT INTO roles(company_id,name,owner,permissions) VALUES($1,'Owner',true,$2) RETURNING id", [cid, permissions])).rows[0];
  const read = (await pool.query("INSERT INTO roles(company_id,name,permissions) VALUES($1,'Viewer',$2) RETURNING id", [cid, ["forms.read"]])).rows[0];
  await pool.query("INSERT INTO company_memberships(company_id,user_id,role_id) VALUES($1,$2,$3),($1,$4,$5)", [cid, owner, role.id, viewer, read.id]);
  session = token();
  viewSession = token();
  await pool.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')", [hash(session), owner, hash(viewSession), viewer]);
});
after(async () => {
  const companies = [cid, other];
  const uploaded = (await pool.query("SELECT storage_name FROM form_files WHERE company_id=ANY($1::uuid[])", [companies])).rows;
  for (const row of uploaded) await unlink(path.join(process.env.UPLOAD_DIR!, "form-files", row.storage_name)).catch(() => {});
  for (const table of ["audit_logs", "form_responses", "forms", "company_memberships", "roles", "uploaded_assets"])
    await pool.query(`DELETE FROM ${table} WHERE company_id=ANY($1::uuid[])`, [companies]);
  await pool.query("DELETE FROM companies WHERE id=ANY($1::uuid[])", [companies]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [ids]);
  for (const file of files) await unlink(path.join(process.env.UPLOAD_DIR!, file)).catch(() => {});
  await pool.end();
});
test("definitions reject backward jumps, unsafe links, and low-contrast buttons", () => {
  const end = createEnding("en"), a = createBlock("name", "en"), b = createBlock("yes_no", "en");
  const parse = (v: any) => formDefinition.safeParse(v).success;
  assert.ok(parse({ blocks: [a, b], endings: [end] }));
  assert.ok(!parse({ blocks: [a, b], endings: [] }));
  assert.ok(!parse({ blocks: [a, { ...b, next: a.id }], endings: [end] }));
  assert.ok(!parse({ blocks: [{ ...a, next: "missing" }, b], endings: [end] }));
  assert.ok(!parse({ blocks: [a, { ...b, options: [] }], endings: [end] }));
  assert.ok(!parse({ blocks: [a, { ...b, id: a.id }], endings: [end] }));
  assert.ok(!parse({ theme: { primary: "#ffffff" }, endings: [end] }));
  assert.ok(!parse({ theme: { logo: "https://evil.test/logo.png" }, endings: [end] }));
  const button = (url: string) => parse({ endings: [{ ...end, buttons: [{ id: "b", label: "Open", url }] }] });
  for (const url of ["javascript:alert(1)", "data:text/html,x", "https://user:pass@example.test", "example.test"]) assert.ok(!button(url), url);
  for (const url of ["https://wa.me/6281234567890", "mailto:team@example.test", "tel:+6281234567890"]) assert.ok(button(url), url);
});
test("answers choose the path and the ending", () => {
  const def = formDefinition.parse(registration());
  const [, , attend, guests] = def.blocks;
  const yes = walk(def, { [attend.id]: attend.options[0].id }), no = walk(def, { [attend.id]: attend.options[1].id });
  assert.equal(yes.path.length, 5);
  assert.equal(yes.ending, def.endings[0].id);
  assert.deepEqual(no.path, def.blocks.slice(0, 3).map((b) => b.id));
  assert.equal(no.ending, def.endings[1].id);
  assert.ok(!no.path.includes(guests.id));
  assert.equal(canonical({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } }), canonical({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }));
});
test("forms stay inside their company and follow role permissions", async () => {
  const form = await create(registration(), "draft");
  assert.equal((await req(`companies/${other}/forms`)).status, 403);
  assert.equal((await req(`companies/${other}/forms/${form.id}`)).status, 403);
  assert.equal((await req(`companies/${cid}/forms`, "GET", undefined, viewSession)).status, 200);
  assert.equal((await req(`companies/${cid}/forms`, "POST", { title: "Nope", slug: "nope", definition: registration() }, viewSession)).status, 403);
  assert.equal((await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, title: "Changed" }, viewSession)).status, 403);
  assert.equal((await req(`companies/${cid}/forms/${form.id}/responses`, "GET", undefined, viewSession)).status, 403);
  assert.equal((await req(`companies/${cid}/forms`, "GET", undefined, "")).status, 401);
  const listed = (await (await req(`companies/${cid}/forms`)).json()).find((f: any) => f.id === form.id);
  assert.equal(listed.blocks, 5);
  assert.equal(listed.definition, undefined);
});
test("drafts are private, published forms are public, and saving tracks versions", async () => {
  const form = await create(registration(), "draft");
  assert.equal((await req(`public-forms/${slug}/${form.slug}`, "GET", undefined, "")).status, 404);
  assert.equal((await save(form, { key: randomUUID(), answers: {} })).status, 404);
  const same = await (await req(`companies/${cid}/forms/${form.id}`, "POST", form)).json();
  assert.equal(same.version, 1);
  const published = await (await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, status: "published", definition: { ...form.definition, welcome: { ...form.definition.welcome, title: "Join us" } } })).json();
  assert.equal(published.version, 2);
  const pub = await (await req(`public-forms/${slug}/${form.slug}`, "GET", undefined, "")).json();
  assert.equal(pub.form.definition.welcome.title, "Join us");
  assert.deepEqual(Object.keys(pub.form).sort(), ["definition", "slug", "status", "title", "version"]);
  assert.equal(JSON.stringify(pub).includes(cid), false);
  const copy = await (await req(`companies/${cid}/forms`, "POST", { title: "Copy", slug: form.slug, definition: registration() })).json();
  assert.equal(copy.slug, "copy");
  const secondCopy = await (await req(`companies/${cid}/forms`, "POST", { title: "Copy", definition: registration() })).json();
  assert.equal(secondCopy.slug, "copy-2");
  assert.equal((await req(`companies/${cid}/forms`, "POST", { title: "Empty", slug: "empty-" + randomUUID().slice(0, 8), status: "published", definition: buildTemplate("blank", "en", "Empty") })).status, 400);
});
test("answers are stored before the form is submitted", async () => {
  const form = await create(registration());
  const [name, phone, attend] = form.definition.blocks, key = randomUUID();
  assert.equal((await (await save(form, { key, answers: {}, position: name.id })).json()).status, "empty");
  assert.equal((await stored(form, key)).length, 0);
  assert.equal((await save(form, { key, answers: { [name.id]: "Bud" }, position: name.id })).status, 200);
  let [row] = await stored(form, key);
  assert.equal(row.status, "partial");
  assert.equal(row.answers[name.id].text, "Bud");
  assert.equal(row.completed_at, null);
  // A half-typed phone number is kept as typed; unknown questions are ignored.
  await save(form, { key, answers: { [name.id]: "Budi Santoso", [phone.id]: "0812", unknown: "x" }, position: phone.id });
  await save(form, { key, answers: { [attend.id]: attend.options[0].id }, position: attend.id });
  [row] = await stored(form, key);
  assert.deepEqual(Object.keys(row.answers).sort(), [name.id, phone.id, attend.id].sort());
  assert.equal(row.answers[name.id].title, name.title);
  assert.equal(row.answers[phone.id].value, "0812");
  assert.equal(row.answers[attend.id].text, "Yes");
  assert.equal(row.position, attend.id);
  await save(form, { key, answers: { [phone.id]: null } });
  [row] = await stored(form, key);
  assert.equal(row.answers[phone.id], undefined);
  assert.equal(row.position, attend.id);
  assert.equal((await stored(form, key)).length, 1);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => save(form, { key: randomUUID(), answers: { [name.id]: "Person " + i } })));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM form_responses WHERE form_id=$1", [form.id])).rows[0].n, 9);
});
test("submission validates the visited path, records the ending, and replays safely", async () => {
  const form = await create(registration());
  const [name, phone, attend, guests, notes] = form.definition.blocks, key = randomUUID();
  const [yes, no] = attend.options;
  await save(form, { key, answers: { [name.id]: "Budi" } });
  const missing = await save(form, { key, answers: { [name.id]: "Budi", [attend.id]: yes.id }, complete: true });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).block, phone.id);
  const invalid = await save(form, { key, answers: { [name.id]: "Budi", [phone.id]: "0812 3456 7890", [attend.id]: yes.id, [guests.id]: "25" }, complete: true });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).block, guests.id);
  assert.equal((await stored(form, key))[0].status, "partial");
  // Declining skips the guest question, so its stale answer is not part of the submission.
  const answers = { [name.id]: "Budi", [phone.id]: "0812 3456 7890", [attend.id]: no.id, [guests.id]: "25", [notes.id]: "ignored" };
  const [first, second] = await Promise.all([save(form, { key, answers, complete: true }), save(form, { key, answers, complete: true })]);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { status: "completed", ending: form.definition.endings[1].id });
  assert.deepEqual(await second.json(), { status: "completed", ending: form.definition.endings[1].id });
  const rows = await stored(form, key);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "completed");
  assert.ok(rows[0].completed_at);
  assert.deepEqual(Object.keys(rows[0].answers).sort(), [name.id, phone.id, attend.id].sort());
  assert.equal(rows[0].answers[phone.id].value, "6281234567890");
  const late = await save(form, { key, answers: { [name.id]: "Changed" } });
  assert.equal(late.status, 409);
  assert.equal((await stored(form, key))[0].answers[name.id].text, "Budi");
  // A respondent whose answers never reached the server can still submit in one request.
  const direct = await save(form, { key: randomUUID(), answers: { [name.id]: "Sari", [phone.id]: "+62 811 1111 111", [attend.id]: yes.id, [guests.id]: 2 }, complete: true });
  assert.deepEqual(await direct.json(), { status: "completed", ending: form.definition.endings[0].id });
  assert.equal((await save(form, { key: "not-a-uuid", answers: {} })).status, 400);
});
test("closed forms and inactive companies stop accepting answers", async () => {
  const form = await create(registration());
  const key = randomUUID(), name = form.definition.blocks[0];
  await save(form, { key, answers: { [name.id]: "Budi" } });
  await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, status: "closed" });
  const closed = await save(form, { key, answers: { [name.id]: "Budi S" } });
  assert.equal(closed.status, 409);
  assert.equal((await closed.json()).closed, true);
  assert.equal((await (await req(`public-forms/${slug}/${form.slug}`, "GET", undefined, "")).json()).form.status, "closed");
  await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, status: "published" });
  await pool.query("UPDATE companies SET status='inactive' WHERE id=$1", [cid]);
  assert.equal((await save(form, { key, answers: { [name.id]: "Budi S" } })).status, 409);
  assert.equal((await req(`public-forms/${slug}/${form.slug}`, "GET", undefined, "")).status, 409);
  await pool.query("UPDATE companies SET status='active' WHERE id=$1", [cid]);
  assert.equal((await stored(form, key))[0].answers[name.id].text, "Budi");
});
test("responses can be listed, searched, exported, and deleted", async () => {
  const form = await create(registration());
  const [name, phone, attend] = form.definition.blocks;
  await save(form, { key: randomUUID(), answers: { [name.id]: "=HYPERLINK(\"https://evil.test\")" } });
  await save(form, { key: randomUUID(), answers: { [name.id]: "Sari Dewi", [phone.id]: "081211112222", [attend.id]: attend.options[1].id }, complete: true });
  // Removing a question keeps the answers that were already given to it.
  await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, definition: { ...form.definition, blocks: form.definition.blocks.filter((b: any) => b.id !== phone.id) } });
  const base = `companies/${cid}/forms/${form.id}/responses`;
  const all = await (await req(base)).json();
  assert.deepEqual(all.counts, { total: 2, completed: 1, files: 0, next_file_expiry: null });
  assert.equal(all.rows.length, 2);
  assert.equal(all.rows[0].session_key, undefined);
  assert.equal((await (await req(base + "?status=partial")).json()).rows.length, 1);
  const found = await (await req(base + "?q=sari")).json();
  assert.equal(found.rows.length, 1);
  assert.equal(found.rows[0].ending_id, form.definition.endings[1].id);
  assert.equal((await (await req(base + "?q=short_text")).json()).rows.length, 0);
  const csv = await (await req(base + "?export=1")).text();
  assert.ok(csv.includes("Will you attend?"));
  assert.ok(csv.includes("What's your phone number? (removed question)"));
  assert.ok(csv.includes("6281211112222"));
  assert.ok(csv.includes(`"'=HYPERLINK`));
  await pool.query("UPDATE roles SET permissions=$1 WHERE company_id=$2 AND NOT owner", [["forms.read", "responses.read"], cid]);
  assert.equal((await req(base, "GET", undefined, viewSession)).status, 200);
  assert.equal((await req(base + "?export=1", "GET", undefined, viewSession)).status, 403);
  assert.equal((await req(`${base}/${found.rows[0].id}`, "DELETE", undefined, viewSession)).status, 403);
  assert.equal((await req(`companies/${other}/forms/${form.id}/responses`)).status, 403);
  assert.equal((await req(`${base}/${found.rows[0].id}`, "DELETE")).status, 200);
  assert.equal((await req(`${base}/${found.rows[0].id}`, "DELETE")).status, 404);
  assert.equal((await (await req(base)).json()).counts.total, 1);
});
test("form images are re-encoded and non-images are rejected", async () => {
  const upload = (blob: Blob, cookie = session) => {
    const data = new FormData();
    data.set("file", blob, "banner.png");
    data.set("kind", "banner");
    return req(`companies/${cid}/form-assets`, "POST", data, cookie);
  };
  const png = await sharp({ create: { width: 2600, height: 400, channels: 4, background: { r: 3, g: 105, b: 161, alpha: 0.5 } } }).png().toBuffer();
  const ok = await upload(new Blob([new Uint8Array(png)], { type: "image/png" }));
  assert.equal(ok.status, 200);
  const { url } = await ok.json();
  assert.match(url, /^\/api\/assets\/[a-f0-9]{64}\.webp$/);
  files.push(url.split("/").pop());
  const meta = await sharp(path.join(process.env.UPLOAD_DIR!, files[0])).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 2000);
  assert.equal(meta.hasAlpha, true);
  assert.ok((await stat(path.join(process.env.UPLOAD_DIR!, files[0]))).size > 0);
  assert.ok(formDefinition.safeParse({ theme: { banner: url }, endings: [createEnding("en")] }).success);
  assert.equal((await upload(new Blob(["<script>alert(1)</script>"], { type: "image/png" }))).status, 400);
  assert.equal((await upload(new Blob([new Uint8Array(png)], { type: "image/png" }), viewSession)).status, 403);
});

test("forms reject duplicates by chosen questions with AND/OR, custom errors, and concurrent completion", async () => {
  const emailBlock = createBlock("email", "en"), phoneBlock = createBlock("phone", "en"), dateBlock = createBlock("date", "en");
  const definition = formDefinition.parse({ blocks: [emailBlock, phoneBlock, dateBlock], endings: [createEnding("en")] });
  definition.settings.duplicate_rule = { enabled: true, fields: [emailBlock.id, dateBlock.id], match: "all", message: "You have already registered for this date." };
  let form = await create(definition);
  const payload = (email: string, date = "2030-01-20", phone = "081234567899") => ({ key: randomUUID(), complete: true, answers: { [emailBlock.id]: email, [phoneBlock.id]: phone, [dateBlock.id]: date } });
  const first = payload("form-dup@example.test");
  assert.equal((await save(form, first)).status, 200);
  assert.equal((await save(form, first)).status, 200); // Idempotent retry.
  const rejected = await save(form, payload("FORM-DUP@example.test"));
  assert.equal(rejected.status, 409);
  assert.equal((await rejected.json()).error, "You have already registered for this date.");
  assert.equal((await save(form, payload("form-dup@example.test", "2030-01-21"))).status, 200);
  const setRule = async (rule: any) => {
    const definition = { ...form.definition, settings: { ...form.definition.settings, duplicate_rule: rule } };
    const response = await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, definition });
    assert.equal(response.status, 200, await response.clone().text());
    form = await response.json();
  };
  await setRule({ enabled: true, fields: [phoneBlock.id, dateBlock.id], match: "any", message: "Phone or date already used." });
  assert.equal((await save(form, payload("other@example.test", "2030-01-22", "+62 812 3456 7899"))).status, 409);
  assert.equal((await save(form, payload("other@example.test", "2030-01-20", "081234567888"))).status, 409);
  await setRule({ enabled: true, fields: [emailBlock.id], match: "any", message: "Email is already registered." });
  const responses = await Promise.all([save(form, payload("concurrent@example.test")), save(form, payload("concurrent@example.test"))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await save(form, { key: randomUUID(), complete: true, answers: {} })).status, 200);
  assert.equal((await save(form, { key: randomUUID(), complete: true, answers: {} })).status, 200); // Empty optional fields do not collide.
  await setRule({ enabled: false, fields: [emailBlock.id], match: "any", message: "Disabled" });
  assert.equal((await save(form, payload("form-dup@example.test"))).status, 200);
});

const upload = (form: any, key: string, block: string, name: string, data: BodyInit, options: { id?: string; signal?: AbortSignal; length?: string } = {}) => {
  const route = `public-forms/${slug}/${form.slug}/files`;
  const query = new URLSearchParams({ key, block, name, upload: options.id ?? randomUUID() });
  return handle(new Request(`${process.env.APP_URL}/api/${route}?${query}`, {
    method: "POST", headers: { "Content-Type": "application/octet-stream", ...(options.length ? { "Content-Length": options.length } : {}) },
    body: data, signal: options.signal, duplex: "half",
  } as RequestInit), route.split("/"));
};
const fileForm = async () => {
  const block = createBlock("file_upload", "id");
  return { block, form: await create({ blocks: [{ ...block, required: true }], endings: [createEnding("id")] }) };
};
test("file upload enforces formats and byte limit, including chunked requests", async () => {
  const { form, block } = await fileForm();
  const key = randomUUID();
  for (const name of ["bad.exe", "bad.html", "bad.zip", "bad"]) assert.equal((await upload(form, key, block.id, name, "x")).status, 400);
  assert.equal((await upload(form, key, block.id, "empty.md", "")).status, 400);
  assert.equal((await upload(form, key, block.id, "fake.png", "not png")).status, 400);
  assert.equal((await upload(form, key, "wrong-question", "text.md", "ok")).status, 400);
  assert.equal((await upload(form, key, block.id, "text.md", "ok", { length: String(MAX_FORM_FILE_BYTES + 1) })).status, 413);
  const chunks = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_FORM_FILE_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  assert.equal((await upload(form, key, block.id, "large.md", chunks)).status, 413);
  const boundary = await upload(form, key, block.id, "limit.MD", "a".repeat(MAX_FORM_FILE_BYTES));
  assert.equal(boundary.status, 200);
  assert.equal((await boundary.json()).size, MAX_FORM_FILE_BYTES);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM form_files WHERE form_id=$1", [form.id])).rows[0].n, 1);
});
test("supported file formats are accepted and safe downloads retain their exact bytes", async () => {
  const { form, block } = await fileForm();
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const jpg = await sharp(png).jpeg().toBuffer();
  const samples: Record<string, Buffer> = { jpeg: jpg, jpg, png, svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), pdf: Buffer.from("%PDF-1.4\n%%EOF"), md: Buffer.from("# hello"), csv: Buffer.from("a,b\n1,2"), doc: Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]), docx: Buffer.from([0x50,0x4b,0x03,0x04]), xlsx: Buffer.from([0x50,0x4b,0x03,0x04]) };
  for (const [ext, bytes] of Object.entries(samples)) {
    const result = await upload(form, randomUUID(), block.id, `sample.${ext}`, bytes as unknown as BodyInit);
    assert.equal(result.status, 200, ext);
    const file = await result.json();
    const download = await req(`companies/${cid}/forms/${form.id}/files/${file.id}`);
    assert.equal(download.status, 200, ext);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.ok(download.headers.get("content-disposition")?.startsWith("attachment;"));
    assert.equal(download.headers.get("content-security-policy"), "sandbox");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  }
});
test("files are scoped to the response, metadata is canonical, and upload retries are idempotent", async () => {
  const { form, block } = await fileForm(), key = randomUUID(), id = randomUUID();
  const answer = await (await upload(form, key, block.id, "original.md", "# File", { id })).json();
  assert.equal((await upload(form, key, block.id, "original.md", "# File", { id })).status, 200);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM form_files WHERE form_id=$1", [form.id])).rows[0].n, 1);
  const body = { key, answers: { [block.id]: { ...answer, name: "forged.md", size: 1 } } };
  assert.equal((await save(form, body)).status, 200);
  const [row] = await stored(form, key);
  assert.equal(row.answers[block.id].text, "original.md");
  assert.deepEqual(row.answers[block.id].file, answer);
  assert.equal((await save(form, { ...body, key: randomUUID(), complete: true })).status, 400);
  assert.equal((await save(form, { key: randomUUID(), complete: true, answers: {} })).status, 400);
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files/${id}`, "GET", undefined, viewSession)).status, 200);
  await pool.query("UPDATE roles SET permissions=$1 WHERE company_id=$2 AND NOT owner", [["forms.read"], cid]);
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files/${id}`, "GET", undefined, viewSession)).status, 403);
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files`, "GET", undefined, viewSession)).status, 403);
  assert.equal((await req(`companies/${other}/forms/${form.id}/files/${id}`)).status, 403);
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files/${id}`, "GET", undefined, "")).status, 401);
  assert.equal((await save(form, { ...body, complete: true })).status, 200);
  assert.equal((await upload(form, key, block.id, "later.md", "later")).status, 409);
});
test("ZIP includes the current file from every response, safely names entries, and deletion removes storage", async () => {
  const { form, block } = await fileForm(), key = randomUUID();
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files`)).status, 404);
  const first = await (await upload(form, key, block.id, "same.md", "old file")).json();
  const second = await (await upload(form, key, block.id, "../same.md", "new file")).json();
  await upload(form, randomUUID(), block.id, "same.md", "other response");
  const zip = await req(`companies/${cid}/forms/${form.id}/files`);
  assert.equal(zip.status, 200);
  const bytes = Buffer.from(await zip.arrayBuffer());
  const entries = JSON.parse(execFileSync("python3", ["-c", "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))"], { input: bytes }).toString());
  assert.equal(Object.keys(entries).length, 2);
  assert.deepEqual(Object.values(entries).sort(), ["new file", "other response"]);
  assert.ok(Object.keys(entries).every(name => !name.split("/").includes("..")));
  assert.ok(!Object.keys(entries).some(name => name.includes(first.id)));
  const counts = (await (await req(`companies/${cid}/forms/${form.id}/responses`)).json()).counts;
  assert.equal(counts.files, 2);
  const [response] = await stored(form, key);
  const rows = (await pool.query("SELECT storage_name FROM form_files WHERE response_id=$1", [response.id])).rows;
  assert.equal((await req(`companies/${cid}/forms/${form.id}/responses/${response.id}`, "DELETE")).status, 200);
  for (const row of rows) await assert.rejects(stat(path.join(process.env.UPLOAD_DIR!, "form-files", row.storage_name)));
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files/${second.id}`)).status, 404);
});
test("cancelled streams remove unfinished files and do not create file records", async () => {
  const { form, block } = await fileForm();
  const controller = new AbortController();
  const data = new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode("partial")); } });
  const result = upload(form, randomUUID(), block.id, "cancelled.md", data, { signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  assert.equal((await result).status, 408);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM form_files WHERE form_id=$1", [form.id])).rows[0].n, 0);
  const names = await readdir(path.join(process.env.UPLOAD_DIR!, "form-files"));
  assert.ok(!names.some(name => name.endsWith(".part")));
});

test("concurrent upload limits keep health responsive and cancelled uploads release capacity", async () => {
  const { form, block } = await fileForm();
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const requests = controllers.map(controller => upload(form, randomUUID(), block.id, "slow.md", new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode("slow")); } }), { signal: controller.signal }));
  try {
    for (let n = 0; n < 100 && (globalThis as any).formTransfers.uploads < 4; n++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((globalThis as any).formTransfers.uploads, 4);
    assert.equal((await upload(form, randomUUID(), block.id, "busy.md", "ok")).status, 503);
    assert.equal((await req("health/ready")).status, 200);
  } finally { controllers.forEach(controller => controller.abort()); }
  assert.ok((await Promise.all(requests)).every(response => response.status === 408));
  const next = await upload(form, randomUUID(), block.id, "next.md", "ok");
  assert.equal(next.status, 200);
});
test("ZIP concurrency is bounded and cancelling a download releases capacity", async () => {
  const { form, block } = await fileForm();
  assert.equal((await upload(form, randomUUID(), block.id, "large.md", "a".repeat(MAX_FORM_FILE_BYTES))).status, 200);
  const route = `companies/${cid}/forms/${form.id}/files`;
  const responses = await Promise.all([req(route), req(route), req(route)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 200, 503]);
  const [a, b] = responses.filter(response => response.status === 200);
  await Promise.all([a.body!.cancel(), b.body!.cancel()]);
  for (let n = 0; n < 100 && (globalThis as any).formTransfers.downloads; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((globalThis as any).formTransfers.downloads, 0);
  const next = await req(route);
  assert.equal(next.status, 200);
  await next.arrayBuffer();
});

test("only uploaded files expire after thirty days; original text answers and response stay saved", async () => {
  const { form, block } = await fileForm(), key = randomUUID();
  const file = await (await upload(form, key, block.id, "expire.md", "attachment content")).json();
  const created = (await pool.query("SELECT * FROM form_files WHERE id=$1", [file.id])).rows[0];
  assert.ok(Math.abs((created.expires_at.getTime()-created.created_at.getTime())/86400000-30)<0.01);
  const text = createBlock("short_text", "id");
  await req(`companies/${cid}/forms/${form.id}`, "POST", { ...form, definition: { ...form.definition, blocks: [text, block] } });
  assert.equal((await save(form, { key, complete: true, answers: { [block.id]: file, [text.id]: "Text must remain" } })).status, 200);
  await pool.query("UPDATE form_files SET expires_at=now()-interval '1 minute' WHERE id=$1", [file.id]);
  assert.equal((await req(`companies/${cid}/forms/${form.id}/files/${file.id}`)).status, 410);
  const listing = await (await req(`companies/${cid}/forms/${form.id}/responses`)).json();
  assert.equal(listing.counts.files, 0);
  assert.equal(listing.counts.next_file_expiry, null);
  assert.equal(listing.rows[0].answers[block.id].file.available, false);
  await cleanupFormFiles();
  await assert.rejects(stat(path.join(process.env.UPLOAD_DIR!, "form-files", created.storage_name)));
  const [saved] = await stored(form, key);
  assert.equal(saved.status, "completed");
  assert.equal(saved.answers[text.id].text, "Text must remain");
  assert.equal(saved.answers[block.id].text, "expire.md");
  assert.ok((await pool.query("SELECT deleted_at FROM form_files WHERE id=$1", [file.id])).rows[0].deleted_at);
});
