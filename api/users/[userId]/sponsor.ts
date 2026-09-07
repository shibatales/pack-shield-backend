import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  allowMethods,
  readJsonBody,
  requireAppApiKey,
  requireUserId,
  sendJson
} from "../../../lib/http.js";
import { normalizePhone } from "../../../lib/phone.js";
import {
  getUserPhoneRecord,
  getSponsorRecord,
  publicSponsorRecord,
  saveSponsorRecord,
  sponsorVerificationStatus,
  userPhoneVerificationStatus,
  type SponsorRecord
} from "../../../lib/store.js";
import { createPinVerifier, pinMatches } from "../../../lib/pin.js";
import { randomDigits } from "../../../lib/security.js";
import {
  hasTwilioOutboundConfig,
  sendSponsorInvite,
  sendSponsorReplacementNotice
} from "../../../lib/twilio.js";

interface SponsorBody {
  sponsorPhone?: unknown;
  sponsorName?: unknown;
  currentSponsorPin?: unknown;
  sendInvite?: unknown;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["GET", "POST"])) {
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
    const sponsor = await getSponsorRecord(userId);
    sendJson(response, 200, {
      ok: true,
      sponsor: sponsor ? publicSponsorRecord(sponsor) : null
    });
    return;
  }

  const body = readJsonBody<SponsorBody>(request);
  let sponsorPhone: string;
  try {
    sponsorPhone = normalizePhone(String(body.sponsorPhone ?? ""));
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid_sponsor_phone" });
    return;
  }

  const userPhoneRecord = await getUserPhoneRecord(userId);
  if (!userPhoneRecord || userPhoneVerificationStatus(userPhoneRecord) !== "verified") {
    sendJson(response, 409, { ok: false, error: "user_phone_not_verified" });
    return;
  }

  if (userPhoneRecord.userPhone === sponsorPhone) {
    sendJson(response, 400, { ok: false, error: "sponsor_cannot_match_user_phone" });
    return;
  }

  const existing = await getSponsorRecord(userId);
  const previousSponsorPhone = existing?.sponsorPhone;
  const replacingVerifiedSponsor = Boolean(
    existing &&
      existing.sponsorPhone !== sponsorPhone &&
      sponsorVerificationStatus(existing) === "verified"
  );

  if (replacingVerifiedSponsor) {
    if (!existing?.pinVerifier) {
      sendJson(response, 409, { ok: false, error: "current_sponsor_pin_not_set" });
      return;
    }

    const currentSponsorPin =
      typeof body.currentSponsorPin === "string" ? body.currentSponsorPin.trim() : "";
    if (!currentSponsorPin) {
      sendJson(response, 403, { ok: false, error: "current_sponsor_pin_required" });
      return;
    }

    if (!(await pinMatches(currentSponsorPin, existing.pinVerifier))) {
      sendJson(response, 403, { ok: false, error: "current_sponsor_pin_mismatch" });
      return;
    }
  }

  const sponsorName =
    typeof body.sponsorName === "string" && body.sponsorName.trim()
      ? body.sponsorName.trim().slice(0, 80)
      : undefined;
  const now = new Date().toISOString();
  const phoneUnchanged = existing?.sponsorPhone === sponsorPhone;
  const needsVerification = !phoneUnchanged || existing?.verificationStatus !== "verified";
  const verificationCode = needsVerification ? randomDigits(6) : undefined;
  const verificationCodeVerifier = verificationCode
    ? await createPinVerifier(verificationCode, new Date(now))
    : existing?.verificationCodeVerifier;
  const record: SponsorRecord = {
    userId,
    sponsorPhone,
    sponsorName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    verificationStatus: needsVerification ? "pending" : "verified",
    verificationCodeVerifier,
    verificationCodeCreatedAt: verificationCode ? now : existing?.verificationCodeCreatedAt,
    verifiedAt: needsVerification ? undefined : existing?.verifiedAt,
    pinVerifier: phoneUnchanged && !needsVerification ? existing.pinVerifier : undefined
  };

  await saveSponsorRecord(record, previousSponsorPhone);

  const shouldSendInvite = body.sendInvite === true;
  let inviteSent = false;
  let warning: string | null = null;
  if (shouldSendInvite) {
    if (!verificationCode) {
      warning = "sponsor_already_verified";
    } else if (hasTwilioOutboundConfig()) {
      await sendSponsorInvite(sponsorPhone, sponsorName, verificationCode);
      inviteSent = true;
    } else {
      warning = "twilio_not_configured";
    }
  }

  if (replacingVerifiedSponsor && previousSponsorPhone && hasTwilioOutboundConfig()) {
    await sendSponsorReplacementNotice(previousSponsorPhone);
  }

  sendJson(response, 200, {
    ok: true,
    sponsor: publicSponsorRecord(record),
    inviteSent,
    verificationRequired: record.verificationStatus !== "verified",
    warning
  });
}
