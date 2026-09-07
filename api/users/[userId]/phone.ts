import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  allowMethods,
  readJsonBody,
  requireAppApiKey,
  requireUserId,
  sendJson
} from "../../../lib/http.js";
import { normalizePhone } from "../../../lib/phone.js";
import { createPinVerifier, pinMatches } from "../../../lib/pin.js";
import { randomDigits } from "../../../lib/security.js";
import {
  getUserPhoneRecord,
  publicUserPhoneRecord,
  saveUserPhoneRecord,
  userPhoneVerificationStatus,
  type UserPhoneRecord
} from "../../../lib/store.js";
import { hasTwilioOutboundConfig, sendUserPhoneVerification } from "../../../lib/twilio.js";

interface UserPhoneBody {
  userPhone?: unknown;
  verificationCode?: unknown;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["GET", "POST", "PUT"])) {
    return;
  }
  if (!requireAppApiKey(request, response)) {
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  if (request.method === "GET") {
    const record = await getUserPhoneRecord(userId);
    sendJson(response, 200, {
      ok: true,
      userPhone: record ? publicUserPhoneRecord(record) : null
    });
    return;
  }

  if (request.method === "POST") {
    await requestVerificationCode(request, response, userId);
    return;
  }

  await verifyPhone(request, response, userId);
}

async function requestVerificationCode(
  request: VercelRequest,
  response: VercelResponse,
  userId: string
): Promise<void> {
  const body = readJsonBody<UserPhoneBody>(request);

  let userPhone: string;
  try {
    userPhone = normalizePhone(String(body.userPhone ?? ""));
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid_user_phone" });
    return;
  }

  const existing = await getUserPhoneRecord(userId);
  const now = new Date().toISOString();
  const phoneUnchanged = existing?.userPhone === userPhone;
  const alreadyVerified = phoneUnchanged && userPhoneVerificationStatus(existing) === "verified";
  const verificationCode = alreadyVerified ? undefined : randomDigits(6);
  const record: UserPhoneRecord = {
    userId,
    userPhone,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    verificationStatus: alreadyVerified ? "verified" : "pending",
    verificationCodeVerifier: verificationCode
      ? await createPinVerifier(verificationCode, new Date(now))
      : existing?.verificationCodeVerifier,
    verificationCodeCreatedAt: verificationCode ? now : existing?.verificationCodeCreatedAt,
    verifiedAt: alreadyVerified ? existing?.verifiedAt : undefined
  };

  await saveUserPhoneRecord(record);

  let verificationSent = false;
  let warning: string | null = null;
  if (!alreadyVerified) {
    if (hasTwilioOutboundConfig()) {
      await sendUserPhoneVerification(userPhone, verificationCode!);
      verificationSent = true;
    } else {
      warning = "twilio_not_configured";
    }
  }

  sendJson(response, 200, {
    ok: true,
    userPhone: publicUserPhoneRecord(record),
    verificationRequired: record.verificationStatus !== "verified",
    verificationSent,
    warning
  });
}

async function verifyPhone(
  request: VercelRequest,
  response: VercelResponse,
  userId: string
): Promise<void> {
  const body = readJsonBody<UserPhoneBody>(request);
  const verificationCode = String(body.verificationCode ?? "").trim();
  if (!/^\d{6}$/.test(verificationCode)) {
    sendJson(response, 400, { ok: false, error: "invalid_verification_code" });
    return;
  }

  const existing = await getUserPhoneRecord(userId);
  if (!existing?.verificationCodeVerifier) {
    sendJson(response, 409, { ok: false, error: "verification_not_requested" });
    return;
  }

  const matches = await pinMatches(verificationCode, existing.verificationCodeVerifier);
  if (!matches) {
    sendJson(response, 403, { ok: false, error: "verification_code_mismatch" });
    return;
  }

  const now = new Date().toISOString();
  const record: UserPhoneRecord = {
    ...existing,
    updatedAt: now,
    verificationStatus: "verified",
    verificationCodeVerifier: undefined,
    verificationCodeCreatedAt: undefined,
    verifiedAt: now
  };
  await saveUserPhoneRecord(record);

  sendJson(response, 200, {
    ok: true,
    userPhone: publicUserPhoneRecord(record)
  });
}
