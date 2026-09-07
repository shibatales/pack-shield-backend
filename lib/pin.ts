import crypto from "node:crypto";
import { promisify } from "node:util";
import { requiredEnv } from "./env.js";

const pbkdf2 = promisify(crypto.pbkdf2);
const pinPattern = /^\d{4,10}$/;

export interface PinVerifier {
  algorithm: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  digest: string;
  updatedAt: string;
}

export function assertValidPin(pin: string): void {
  if (!pinPattern.test(pin)) {
    throw new Error("PIN must be 4 to 10 digits.");
  }
}

export async function createPinVerifier(pin: string, at = new Date()): Promise<PinVerifier> {
  assertValidPin(pin);
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 160_000;
  const digest = await hashPin(pin, salt, iterations);

  return {
    algorithm: "pbkdf2-sha256",
    iterations,
    salt,
    digest,
    updatedAt: at.toISOString()
  };
}

export async function pinMatches(pin: string, verifier: PinVerifier): Promise<boolean> {
  assertValidPin(pin);
  const digest = await hashPin(pin, verifier.salt, verifier.iterations);
  const left = Buffer.from(digest);
  const right = Buffer.from(verifier.digest);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function hashPin(pin: string, salt: string, iterations: number): Promise<string> {
  const pepper = requiredEnv("PIN_PEPPER");
  const key = await pbkdf2(pin, `${salt}:${pepper}`, iterations, 32, "sha256");
  return key.toString("base64url");
}
