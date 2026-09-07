import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  allowMethods,
  readJsonBody,
  requireAppApiKey,
  requireUserId,
  sendJson
} from "../../../lib/http.js";
import { getSponsorRecord } from "../../../lib/store.js";
import { hasTwilioOutboundConfig, sendText } from "../../../lib/twilio.js";

const allowedActions = new Set(["added", "removed", "edited", "disabled", "cleared"]);

interface ShieldChangeBody {
  action?: unknown;
  summary?: unknown;
  items?: unknown;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["POST"])) {
    return;
  }
  if (!requireAppApiKey(request, response)) {
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  const body = readJsonBody<ShieldChangeBody>(request);
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!allowedActions.has(action)) {
    sendJson(response, 400, { ok: false, error: "invalid_action" });
    return;
  }

  const sponsor = await getSponsorRecord(userId);
  if (!sponsor) {
    sendJson(response, 404, { ok: false, error: "sponsor_not_configured" });
    return;
  }

  if (!hasTwilioOutboundConfig()) {
    sendJson(response, 503, { ok: false, error: "twilio_not_configured" });
    return;
  }

  const summary =
    typeof body.summary === "string" && body.summary.trim()
      ? body.summary.trim()
      : defaultSummary(action);
  const items = Array.isArray(body.items)
    ? body.items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const itemText = items.length > 0 ? ` Items: ${items.join(", ")}.` : "";

  await sendText(
    sponsor.sponsorPhone,
    `Pack Shield: ${summary}.${itemText} A Shield approval code is required to remove or edit Shield items. Reply STOP to opt out, HELP for help.`
  );

  sendJson(response, 200, { ok: true, sent: true });
}

function defaultSummary(action: string): string {
  switch (action) {
  case "added":
    return "The user added new blocked apps or websites";
  case "removed":
    return "The user removed blocked apps or websites";
  case "edited":
    return "The user edited Shield settings";
  case "disabled":
    return "The user disabled Shield";
  case "cleared":
    return "The user cleared Shield items";
  default:
    return "Shield settings changed";
  }
}
