import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  allowMethods,
  readJsonBody,
  requireAppApiKey,
  requireUserId,
  sendJson
} from "../../../lib/http.js";
import { pinMatches } from "../../../lib/pin.js";
import { createApprovalToken } from "../../../lib/security.js";
import {
  getSponsorRecord,
  publicSponsorRecord,
  sponsorVerificationStatus
} from "../../../lib/store.js";

interface SponsorPinBody {
  pin?: unknown;
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

  const sponsor = await getSponsorRecord(userId);
  if (!sponsor) {
    sendJson(response, 404, { ok: false, error: "sponsor_not_configured" });
    return;
  }

  if (request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      hasPin: Boolean(sponsor.pinVerifier),
      canVerifyPin: sponsorVerificationStatus(sponsor) === "verified" && Boolean(sponsor.pinVerifier),
      sponsor: publicSponsorRecord(sponsor)
    });
    return;
  }

  if (sponsorVerificationStatus(sponsor) !== "verified") {
    sendJson(response, 409, { ok: false, error: "sponsor_not_verified" });
    return;
  }

  if (!sponsor.pinVerifier) {
    sendJson(response, 409, { ok: false, error: "sponsor_pin_not_set" });
    return;
  }

  const body = readJsonBody<SponsorPinBody>(request);
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  let verified = false;
  try {
    verified = await pinMatches(pin, sponsor.pinVerifier);
  } catch {
    verified = false;
  }

  if (!verified) {
    sendJson(response, 401, { ok: false, error: "invalid_pin" });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    approvalToken: createApprovalToken(userId),
    expiresInSeconds: 300
  });
}
