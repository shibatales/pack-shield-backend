import twilio from "twilio";
import type { VercelRequest } from "@vercel/node";
import { booleanEnv, optionalEnv, requiredEnv } from "./env.js";
import { requestPublicUrl } from "./http.js";

export const smsConsentVersion = "sms-consent-2026-09-07";
export const smsUnavailableMessage =
  "Text messaging is unavailable right now. You can still save support people and use phone calls.";
export const smsOptInMessage =
  "Pack Shield: You are opted in for Pack Shield verification, sponsor setup, Shield notices, and accountability alerts. Msg frequency varies. Msg&data rates may apply. Reply HELP for help or STOP to opt out.";
export const smsHelpMessage =
  "Pack Shield help: Reply VERIFY plus your invite code to accept, CODE plus 4 to 10 digits to set or update a Shield approval code, or STATUS for status. Msg&data rates may apply. Reply STOP to opt out.";
export const smsOptOutMessage =
  "Pack Shield: You have opted out and will receive no further Pack Shield SMS messages. Reply START to opt back in.";

export function validateTwilioRequest(
  request: VercelRequest,
  params: Record<string, string>
): boolean {
  if (!booleanEnv("TWILIO_VALIDATE_WEBHOOKS", true)) {
    return true;
  }

  const signature = request.headers["x-twilio-signature"];
  const headerSignature = Array.isArray(signature) ? signature[0] : signature;
  if (!headerSignature) {
    return false;
  }

  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const candidateUrls = twilioValidationUrlCandidates(request);
  const isValid = candidateUrls.some((url) =>
    twilio.validateRequest(authToken, headerSignature, url, params)
  );

  if (!isValid) {
    console.warn("Twilio signature validation failed", {
      candidateCount: candidateUrls.length,
      configuredHost: safeHost(optionalEnv("PACKPACT_PUBLIC_BASE_URL")),
      forwardedHost: headerValue(request.headers["x-forwarded-host"]),
      host: headerValue(request.headers.host),
      path: request.url ?? "/"
    });
  }

  return isValid;
}

export async function sendText(to: string, body: string): Promise<void> {
  if (!canSendTwilioMessages()) {
    throw new Error("sms_temporarily_unavailable");
  }

  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const from = requiredEnv("TWILIO_FROM_NUMBER");
  const client = twilio(accountSid, authToken);
  await client.messages.create({ to, from, body });
}

export async function sendSponsorInvite(
  sponsorPhone: string,
  sponsorName: string | undefined,
  verificationCode: string
): Promise<void> {
  void sponsorName;
  await sendText(
    sponsorPhone,
    `Pack Shield: A Pack Shield user says you agreed to be their support contact. To receive account and support alerts, reply VERIFY ${verificationCode}. Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out, HELP for help.`
  );
}

export async function sendUserPhoneVerification(
  userPhone: string,
  verificationCode: string
): Promise<void> {
  await sendText(
    userPhone,
    `Pack Shield: Your verification code is ${verificationCode}. Enter it in the app to verify your phone. Reply STOP to opt out, HELP for help.`
  );
}

export async function sendSponsorReplacementNotice(sponsorPhone: string): Promise<void> {
  await sendText(
    sponsorPhone,
    "Pack Shield: Your sponsor link was changed. You will no longer receive sponsor messages for this user. Reply HELP for help or STOP to opt out."
  );
}

export function twimlMessage(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

export function hasTwilioOutboundConfig(): boolean {
  return Boolean(
    optionalEnv("TWILIO_ACCOUNT_SID") &&
      optionalEnv("TWILIO_AUTH_TOKEN") &&
      optionalEnv("TWILIO_FROM_NUMBER")
  );
}

export function canSendTwilioMessages(): boolean {
  return hasTwilioOutboundConfig();
}

export function publicSmsAvailability(): Record<string, unknown> {
  const outboundConfigured = hasTwilioOutboundConfig();

  return {
    isEnabled: outboundConfigured,
    status: outboundConfigured ? "available" : "temporarily_unavailable",
    message: outboundConfigured ? "Text messaging is available." : smsUnavailableMessage
  };
}

export function smsUnavailableJson(): Record<string, unknown> {
  const sms = publicSmsAvailability();
  return {
    ok: false,
    error: "sms_temporarily_unavailable",
    message: smsUnavailableMessage,
    sms
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twilioValidationUrlCandidates(request: VercelRequest): string[] {
  const configuredUrl = requestPublicUrl(request);
  const path = pathAndQuery(request.url ?? "/");
  const protocol = headerValue(request.headers["x-forwarded-proto"]) ?? "https";
  const hostCandidates = [
    headerValue(request.headers["x-forwarded-host"]),
    headerValue(request.headers.host),
    optionalEnv("VERCEL_PROJECT_PRODUCTION_URL"),
    optionalEnv("VERCEL_URL")
  ];

  const urls = [
    configuredUrl,
    ...hostCandidates.flatMap((host) => {
      if (!host) { return []; }
      const origin = host.startsWith("http://") || host.startsWith("https://")
        ? host
        : `${protocol}://${host}`;
      return [new URL(path, origin).toString()];
    })
  ];

  return Array.from(new Set(urls.flatMap(trailingSlashVariants)));
}

function pathAndQuery(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url;
  }

  const parsedUrl = new URL(url);
  return `${parsedUrl.pathname}${parsedUrl.search}`;
}

function trailingSlashVariants(url: string): string[] {
  const parsedUrl = new URL(url);
  if (parsedUrl.search) {
    return [url];
  }

  const withoutSlash = url.replace(/\/$/, "");
  return Array.from(new Set([withoutSlash, `${withoutSlash}/`]));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeHost(url: string | undefined): string | undefined {
  if (!url) { return undefined; }
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}
