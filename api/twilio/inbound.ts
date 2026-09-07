import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, formBodyParams } from "../../lib/http.js";
import { createPinVerifier, pinMatches } from "../../lib/pin.js";
import { normalizePhone } from "../../lib/phone.js";
import {
  getSponsorRecord,
  getUserIdsForSponsorPhone,
  saveSponsorRecord,
  sponsorVerificationStatus,
  type SponsorRecord
} from "../../lib/store.js";
import {
  smsHelpMessage,
  smsOptInMessage,
  smsOptOutMessage,
  twimlMessage,
  validateTwilioRequest
} from "../../lib/twilio.js";

const optInKeywords = new Set(["START", "YES", "UNSTOP"]);
const optOutKeywords = new Set([
  "CANCEL",
  "END",
  "OPTOUT",
  "QUIT",
  "REVOKE",
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE"
]);

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["POST"])) {
    return;
  }

  const params = formBodyParams(request);
  if (!validateTwilioRequest(request, params)) {
    response.status(403);
    response.setHeader("Content-Type", "text/plain");
    response.send("Forbidden");
    return;
  }

  let sponsorPhone: string;
  try {
    sponsorPhone = normalizePhone(params.From ?? "");
  } catch {
    sendTwiml(response, "Pack Shield could not read your sender phone number.");
    return;
  }

  const body = (params.Body ?? "").trim();
  const reply = await handleSponsorCommand(sponsorPhone, body);
  sendTwiml(response, reply);
}

async function handleSponsorCommand(
  sponsorPhone: string,
  body: string
): Promise<string> {
  const upperBody = body.toUpperCase();
  if (optOutKeywords.has(upperBody)) {
    return smsOptOutMessage;
  }

  if (optInKeywords.has(upperBody)) {
    return smsOptInMessage;
  }

  if (!body || upperBody === "HELP" || upperBody === "?" || upperBody === "INFO") {
    return smsHelpMessage;
  }

  if (upperBody === "STATUS") {
    const linkedUsers = await linkedSponsorUsers(sponsorPhone);
    if (linkedUsers.length === 0) {
      return "Pack Shield: This phone is not registered as a sponsor yet. Reply STOP to opt out, HELP for help.";
    }

    const verifiedCount = linkedUsers.filter(
      (record) => sponsorVerificationStatus(record) === "verified"
    ).length;
    const pinCount = linkedUsers.filter((record) => Boolean(record.pinVerifier)).length;
    return `Pack Shield: This phone sponsors ${linkedUsers.length} link(s). Verified: ${verifiedCount}. Shield approval code set on ${pinCount}. Reply STOP to opt out.`;
  }

  const verifyMatch = body.match(/^VERIFY\s+(\d{6})$/i);
  if (verifyMatch) {
    const linkedUsers = await linkedSponsorUsers(sponsorPhone);
    if (linkedUsers.length === 0) {
      return "Pack Shield: This phone is not registered as a sponsor yet. Ask the user to add you as their sponsor first. Reply STOP to opt out.";
    }

    const now = new Date().toISOString();
    const matches = [];
    for (const record of linkedUsers) {
      if (
        record.verificationCodeVerifier &&
        sponsorVerificationStatus(record) !== "verified" &&
        await pinMatches(verifyMatch[1], record.verificationCodeVerifier)
      ) {
        matches.push(record);
      }
    }

    if (matches.length === 0) {
      return "Pack Shield: That verification code did not match. Check the invite text and reply VERIFY followed by the 6-digit code. Reply HELP for help.";
    }

    await Promise.all(
      matches.map((record) =>
        saveSponsorRecord({
          ...record,
          updatedAt: now,
          verificationStatus: "verified",
          verificationCodeVerifier: undefined,
          verificationCodeCreatedAt: undefined,
          verifiedAt: now
        })
      )
    );

    return "Pack Shield: Support contact verified. To set or change the Shield approval code for this user's account, reply CODE followed by 4 to 10 digits. Msg frequency varies. Msg&data rates may apply. Reply STOP to opt out, HELP for help.";
  }

  const pinMatch = body.match(/^(?:CODE|PIN)\s+(\d{4,10})$/i);
  if (!pinMatch) {
    return "Pack Shield: Command not recognized. Reply VERIFY plus your invite code to accept, CODE plus 4 to 10 digits after verification, or HELP for help.";
  }

  const linkedUsers = await linkedSponsorUsers(sponsorPhone);
  if (linkedUsers.length === 0) {
    return "Pack Shield: This phone is not registered as a sponsor yet. Ask the user to add you as their sponsor first. Reply STOP to opt out.";
  }

  const verifiedUsers = linkedUsers.filter(
    (record) => sponsorVerificationStatus(record) === "verified"
  );
  if (verifiedUsers.length === 0) {
    return "Pack Shield: This sponsor link is not verified yet. Reply VERIFY followed by the 6-digit invite code first.";
  }

  const pinVerifier = await createPinVerifier(pinMatch[1]);
  await Promise.all(
    verifiedUsers.map((record) =>
      saveSponsorRecord({
        ...record,
        updatedAt: pinVerifier.updatedAt,
        pinVerifier
      })
    )
  );

  return `Pack Shield: Shield approval code updated for ${verifiedUsers.length} link(s). Keep this code confidential. Reply STOP to opt out.`;
}

async function linkedSponsorUsers(sponsorPhone: string) {
  const userIds = await getUserIdsForSponsorPhone(sponsorPhone);
  const records = await Promise.all(userIds.map((userId) => getSponsorRecord(userId)));
  return records.filter(
    (record): record is SponsorRecord =>
      Boolean(record && record.sponsorPhone === sponsorPhone)
  );
}

function sendTwiml(response: VercelResponse, message: string): void {
  response.status(200);
  response.setHeader("Content-Type", "text/xml");
  response.send(twimlMessage(message));
}
