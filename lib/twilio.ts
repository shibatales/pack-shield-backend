import twilio from "twilio";
import type { VercelRequest } from "@vercel/node";
import { booleanEnv, optionalEnv, requiredEnv } from "./env.js";
import { requestPublicUrl } from "./http.js";

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
  const name = sponsorName ? ` ${sponsorName}` : "";
  await sendText(
    sponsorPhone,
    `PackPact:${name} you were invited as a recovery sponsor. Text VERIFY ${verificationCode} to accept. Then text PIN followed by 4-10 digits to set the private Shield PIN.`
  );
}

export async function sendUserPhoneVerification(
  userPhone: string,
  verificationCode: string
): Promise<void> {
  await sendText(
    userPhone,
    `PackPact verification code: ${verificationCode}. Enter this in the app before adding an SMS sponsor.`
  );
}

export async function sendSponsorReplacementNotice(sponsorPhone: string): Promise<void> {
  await sendText(
    sponsorPhone,
    "PackPact: your sponsor link was changed. If this was not expected, check in with the PackPact user."
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
