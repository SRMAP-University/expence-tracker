import {
  MAX_CODE_LENGTH,
  MAX_SMALL_BODY_BYTES,
  delay,
  jsonResponse,
  logServerError,
  optionalText,
  pairDevice,
  parseJsonObject,
  readBodyLimited,
  unpairDevice,
} from "@/lib/mobile";

export const runtime = "nodejs";

// POST /api/mobile/pair  { code, deviceName? } -> { token, user }
export async function POST(request: Request) {
  try {
    const text = await readBodyLimited(request, MAX_SMALL_BODY_BYTES);
    if (text === null) {
      return jsonResponse({ error: "Request too large" }, 413);
    }

    const body = parseJsonObject(text);
    if (!body) {
      return jsonResponse({ error: "Body must be a JSON object" }, 400);
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > MAX_CODE_LENGTH) {
      return jsonResponse({ error: "Enter a valid code" }, 400);
    }

    const result = await pairDevice(code, optionalText(body.deviceName, 100));
    if (!result) {
      // Slow down code guessing.
      await delay(600);
      return jsonResponse({ error: "Wrong code" }, 401);
    }

    return jsonResponse({ token: result.token, user: result.user });
  } catch (err) {
    logServerError("POST /api/mobile/pair", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// DELETE /api/mobile/pair  (Authorization: Bearer <token>) -> { ok: true }
export async function DELETE(request: Request) {
  try {
    const removed = await unpairDevice(request);
    if (!removed) {
      return jsonResponse({ error: "Not paired" }, 401);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    logServerError("DELETE /api/mobile/pair", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
