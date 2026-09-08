import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import { allowMethods, requireAppApiKey, sendJson } from "../../lib/http.js";
import { optionalEnv } from "../../lib/env.js";
import { hasTwilioOutboundConfig, publicSmsAvailability } from "../../lib/twilio.js";

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
  const validateWebhooks = optionalEnv("TWILIO_VALIDATE_WEBHOOKS");

  const result: Record<string, unknown> = {
    ok: true,
    hasAccountSid: Boolean(accountSid),
    accountSidLooksValid: Boolean(accountSid?.match(/^AC[0-9a-fA-F]{32}$/)),
    hasAuthToken: Boolean(authToken),
    authTokenLooksQuoted: Boolean(authToken?.startsWith("\"") || authToken?.endsWith("\"")),
    hasFromNumber: Boolean(fromNumber),
    fromNumberLooksValid: Boolean(fromNumber?.match(/^\+\d{7,15}$/)),
    validateWebhooks: validateWebhooks ?? "default_true",
    smsOutboundConfigured: hasTwilioOutboundConfig(),
    sms: publicSmsAvailability()
  };

  if (!accountSid || !authToken || !fromNumber) {
    sendJson(response, 200, result);
    return;
  }

  const client = twilio(accountSid, authToken);
  try {
    const account = await client.api.accounts(accountSid).fetch();
    result.accountFetchOk = true;
    result.accountStatus = account.status;
  } catch (error) {
    result.accountFetchOk = false;
    result.accountFetchError = diagnosticError(error);
  }

  try {
    const numbers = await client.incomingPhoneNumbers.list({
      phoneNumber: fromNumber,
      limit: 1
    });
    result.fromNumberBelongsToAccount = numbers.length > 0;
    result.fromNumberCapabilities = numbers[0]?.capabilities ?? null;
  } catch (error) {
    result.fromNumberBelongsToAccount = false;
    result.fromNumberFetchError = diagnosticError(error);
  }

  sendJson(response, 200, result);
}

function diagnosticError(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };
    return {
      code: candidate.code,
      status: candidate.status,
      message: typeof candidate.message === "string" ? candidate.message.slice(0, 180) : undefined
    };
  }

  return { message: String(error).slice(0, 180) };
}
