import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import { optionalEnv } from "../../lib/env.js";
import { allowMethods, requireAppApiKey, sendJson } from "../../lib/http.js";
import { maskedPhone } from "../../lib/phone.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["GET"])) {
    return;
  }
  if (!requireAppApiKey(request, response)) {
    return;
  }

  const accountSid = optionalEnv("TWILIO_ACCOUNT_SID");
  const authToken = optionalEnv("TWILIO_AUTH_TOKEN");
  const fromNumber = optionalEnv("TWILIO_FROM_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    sendJson(response, 500, { ok: false, error: "twilio_not_configured" });
    return;
  }

  const client = twilio(accountSid, authToken);
  const messages = await client.messages.list({ limit: 12 });
  sendJson(response, 200, {
    ok: true,
    messages: messages.map((message) => ({
      sidPrefix: message.sid.slice(0, 6),
      direction: message.direction,
      status: message.status,
      from: maskedPhone(message.from),
      to: maskedPhone(message.to),
      usesPackPactNumber: message.from === fromNumber || message.to === fromNumber,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      dateCreated: message.dateCreated?.toISOString()
    }))
  });
}
