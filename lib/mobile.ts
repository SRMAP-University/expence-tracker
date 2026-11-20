import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { sql } from "@/lib/db";

// Shared helpers for the companion mobile app's sync API (app/api/mobile/*).
// Never log tokens or codes from here.

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
export const MAX_SMALL_BODY_BYTES = 16 * 1024;
export const MAX_CODE_LENGTH = 200;
const HISTORY_KEEP = 10;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

let tablesReady: Promise<void> | null = null;

/** Creates the mobile tables once per server instance (retries after a failure). */
export function ensureMobileTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = createMobileTables().catch((err: unknown) => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

async function createMobileTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS mobile_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      device_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS mobile_devices_user_id_idx
    ON mobile_devices (user_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mobile_backups (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      app_version TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS mobile_backup_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS mobile_backup_history_user_created_idx
    ON mobile_backup_history (user_id, created_at DESC);
  `;
}

// ---------------------------------------------------------------------------
// Tokens and auth
// ---------------------------------------------------------------------------

// 32 random bytes in base64url without padding is always 43 characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Returns a new plain device token (give it to the app once) and its hash (store this). */
export function newDeviceToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** Constant-time string comparison (compares SHA-256 digests so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match || !TOKEN_PATTERN.test(match[1])) return null;
  return match[1];
}

export interface MobileDevice {
  id: string;
  userId: string;
}

/**
 * Resolves the device from `Authorization: Bearer <token>` and marks it as
 * seen. Returns null when the header is missing/malformed or the token is not
 * paired.
 */
export async function authenticateDevice(
  request: Request
): Promise<MobileDevice | null> {
  const token = readBearerToken(request);
  if (!token) return null;

  await ensureMobileTables();
  const tokenHash = hashToken(token);
  const rows = (await sql`
    UPDATE mobile_devices SET last_seen_at = NOW()
    WHERE token_hash = ${tokenHash}
    RETURNING id, user_id, token_hash
  `) as { id: string; user_id: string; token_hash: string }[];

  if (rows.length === 0 || !safeEqual(rows[0].token_hash, tokenHash)) {
    return null;
  }
  return { id: rows[0].id, userId: rows[0].user_id };
}

/** Removes the device that owns the bearer token. Returns false if none. */
export async function unpairDevice(request: Request): Promise<boolean> {
  const device = await authenticateDevice(request);
  if (!device) return false;
  await sql`DELETE FROM mobile_devices WHERE id = ${device.id}`;
  return true;
}

export interface PairedUser {
  id: string;
  name: string | null;
  email: string;
}

/** Looks up a user by their login code and creates a device token for them. */
export async function pairDevice(
  code: string,
  deviceName: string | null
): Promise<{ token: string; user: PairedUser } | null> {
  const rows = (await sql`
    SELECT id, code, email, name FROM users WHERE code = ${code}
  `) as { id: string; code: string; email: string; name: string | null }[];

  if (rows.length === 0 || !safeEqual(rows[0].code, code)) return null;
  const user = rows[0];

  await ensureMobileTables();
  const { token, tokenHash } = newDeviceToken();
  await sql`
    INSERT INTO mobile_devices (id, user_id, token_hash, device_name, last_seen_at)
    VALUES (${randomUUID()}, ${user.id}, ${tokenHash}, ${deviceName}, NOW())
  `;

  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

export interface StoredBackup {
  data: Record<string, unknown>;
  savedAt: string;
  appVersion: string | null;
}

/**
 * Upserts the user's latest backup. In the same transaction, adds a restore
 * point when the newest one is older than an hour (or none exists), then keeps
 * only the newest HISTORY_KEEP restore points.
 */
export async function saveBackup(
  device: MobileDevice,
  data: Record<string, unknown>,
  appVersion: string | null,
  deviceName: string | null
): Promise<string> {
  const userId = device.userId;
  const dataJson = JSON.stringify(data);

  const queries = [
    sql`
      INSERT INTO mobile_backups (user_id, data, app_version, updated_at)
      VALUES (${userId}, ${dataJson}::jsonb, ${appVersion}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        data = EXCLUDED.data,
        app_version = EXCLUDED.app_version,
        updated_at = EXCLUDED.updated_at
      RETURNING updated_at
    `,
    // Copies the row just written so the payload is only sent once.
    sql`
      INSERT INTO mobile_backup_history (id, user_id, data)
      SELECT ${randomUUID()}::text, b.user_id, b.data
      FROM mobile_backups b
      WHERE b.user_id = ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM mobile_backup_history h
          WHERE h.user_id = ${userId}
            AND h.created_at > NOW() - INTERVAL '1 hour'
        )
    `,
    sql`
      DELETE FROM mobile_backup_history
      WHERE user_id = ${userId}
        AND id NOT IN (
          SELECT id FROM mobile_backup_history
          WHERE user_id = ${userId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${HISTORY_KEEP}
        )
    `,
  ];
  if (deviceName) {
    queries.push(
      sql`UPDATE mobile_devices SET device_name = ${deviceName} WHERE id = ${device.id}`
    );
  }

  const [upserted] = await sql.transaction(queries);
  return toIsoString(upserted[0].updated_at);
}

export async function loadBackup(userId: string): Promise<StoredBackup | null> {
  const rows = (await sql`
    SELECT data, app_version, updated_at FROM mobile_backups WHERE user_id = ${userId}
  `) as {
    data: Record<string, unknown>;
    app_version: string | null;
    updated_at: Date | string;
  }[];
  if (rows.length === 0) return null;
  return {
    data: rows[0].data,
    savedAt: toIsoString(rows[0].updated_at),
    appVersion: rows[0].app_version ?? null,
  };
}

function toIsoString(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString();
}

// ---------------------------------------------------------------------------
// Request / response helpers
// ---------------------------------------------------------------------------

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the declared Content-Length is already over the limit. */
export function declaredTooLarge(request: Request, maxBytes: number): boolean {
  const declared = Number(request.headers.get("content-length"));
  return Number.isFinite(declared) && declared > maxBytes;
}

/**
 * Reads the body as UTF-8 text, stopping once it exceeds maxBytes (covers
 * chunked uploads without a Content-Length). Returns null when too large.
 */
export async function readBodyLimited(
  request: Request,
  maxBytes: number
): Promise<string | null> {
  if (declaredTooLarge(request, maxBytes)) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses text as a JSON object; null when invalid or not an object. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Optional metadata strings: non-strings and blanks become null; long ones are clipped. */
export function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/** Logs a server error without request data (no tokens, codes or payloads). */
export function logServerError(route: string, err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[${route}] ${message}`);
}
