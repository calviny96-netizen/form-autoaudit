import pg from "pg";
const globalDb = globalThis as unknown as { pool: pg.Pool };
export const pool =
  globalDb.pool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
if (process.env.NODE_ENV !== "production") globalDb.pool = pool;
export type DB = Pick<pg.PoolClient, "query">;
export async function transaction<T>(fn: (db: DB) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const r = await fn(db);
    await db.query("COMMIT");
    return r;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export async function audit(
  db: DB,
  actor: string | null,
  company: string | null,
  action: string,
  id?: string,
) {
  await db.query(
    "INSERT INTO audit_logs(actor_id,company_id,action,entity_id) VALUES($1,$2,$3,$4)",
    [actor, company, action, id ?? null],
  );
}
