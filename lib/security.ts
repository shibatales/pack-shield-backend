import crypto from "node:crypto";
import { requiredEnv } from "./env.js";

interface ApprovalTokenPayload {
  userId: string;
  scope: "shield_approval";
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

export function createApprovalToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: ApprovalTokenPayload = {
    userId,
    scope: "shield_approval",
    issuedAt: now,
    expiresAt: now + 5 * 60,
    nonce: crypto.randomBytes(12).toString("base64url")
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function randomDigits(length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += crypto.randomInt(0, 10).toString();
  }
  return value;
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", requiredEnv("APP_SIGNING_SECRET"))
    .update(value)
    .digest("base64url");
}
