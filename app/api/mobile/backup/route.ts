import {
  MAX_BACKUP_BYTES,
  authenticateDevice,
  declaredTooLarge,
  isJsonObject,
  jsonResponse,
  loadBackup,
  logServerError,
  optionalText,
  parseJsonObject,
  readBodyLimited,
  saveBackup,
} from "@/lib/mobile";

export const runtime = "nodejs";

// PUT /api/mobile/backup  (Bearer) { data, appVersion?, deviceName? } -> { savedAt }
export async function PUT(request: Request) {
  try {
    if (declaredTooLarge(request, MAX_BACKUP_BYTES)) {
      return jsonResponse({ error: "Backup too large" }, 413);
    }

    const device = await authenticateDevice(request);
    if (!device) {
      return jsonResponse({ error: "Not paired" }, 401);
    }

    const text = await readBodyLimited(request, MAX_BACKUP_BYTES);
    if (text === null) {
      return jsonResponse({ error: "Backup too large" }, 413);
    }

    const body = parseJsonObject(text);
    if (!body) {
      return jsonResponse({ error: "Body must be a JSON object" }, 400);
    }
    if (!isJsonObject(body.data)) {
      return jsonResponse({ error: "data must be a JSON object" }, 400);
    }

    const savedAt = await saveBackup(
      device,
      body.data,
      optionalText(body.appVersion, 50),
      optionalText(body.deviceName, 100)
    );
    return jsonResponse({ savedAt });
  } catch (err) {
    logServerError("PUT /api/mobile/backup", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}

// GET /api/mobile/backup  (Bearer) -> { data, savedAt, appVersion }
export async function GET(request: Request) {
  try {
    const device = await authenticateDevice(request);
    if (!device) {
      return jsonResponse({ error: "Not paired" }, 401);
    }

    const backup = await loadBackup(device.userId);
    if (!backup) {
      return jsonResponse({ error: "No backup yet" }, 404);
    }
    return jsonResponse(backup);
  } catch (err) {
    logServerError("GET /api/mobile/backup", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
}
