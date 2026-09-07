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
import { twimlMessage, validateTwilioRequest } from "../../lib/twilio.js";

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
    sendTwiml(response, "PackPact could not read your sender phone number.");
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
  if (!body || upperBody === "HELP" || upperBody === "?" || upperBody === "INFO") {
    return "PackPact sponsor commands: text PIN followed by 4-10 digits to set or rotate the private Shield PIN. Example: PIN 482913";
  }

  if (upperBody === "STATUS") {
    const linkedUsers = await linkedSponsorUsers(sponsorPhone);
    if (linkedUsers.length === 0) {
      return "This phone is not registered as a PackPact sponsor yet.";
    }

    const verifiedCount = linkedUsers.filter(
      (record) => sponsorVerificationStatus(record) === "verified"
    ).length;
    const pinCount = linkedUsers.filter((record) => Boolean(record.pinVerifier)).length;
    return `This phone sponsors ${linkedUsers.length} PackPact link(s). Verified: ${verifiedCount}. Private PIN set on ${pinCount}.`;
  }

  const verifyMatch = body.match(/^VERIFY\s+(\d{6})$/i);
  if (verifyMatch) {
    const linkedUsers = await linkedSponsorUsers(sponsorPhone);
    if (linkedUsers.length === 0) {
      return "This phone is not registered as a PackPact sponsor yet. Ask the user to add you as their sponsor first.";
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
      return "That PackPact verification code did not match. Check the invite text and try VERIFY followed by the 6-digit code.";
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

    return `PackPact sponsor link verified for ${matches.length} account(s). You can now text PIN followed by 4-10 digits to set or rotate the private Shield PIN.`;
  }

  const pinMatch = body.match(/^PIN\s+(\d{4,10})$/i);
  if (!pinMatch) {
    return "Command not recognized. Text VERIFY followed by your invite code, or PIN followed by 4-10 digits after verification.";
  }

  const linkedUsers = await linkedSponsorUsers(sponsorPhone);
  if (linkedUsers.length === 0) {
    return "This phone is not registered as a PackPact sponsor yet. Ask the user to add you as their sponsor first.";
  }

  const verifiedUsers = linkedUsers.filter(
    (record) => sponsorVerificationStatus(record) === "verified"
  );
  if (verifiedUsers.length === 0) {
    return "This sponsor link is not verified yet. Text VERIFY followed by the 6-digit invite code first.";
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

  return `PackPact sponsor PIN updated for ${verifiedUsers.length} link(s). Keep it private from the user.`;
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
