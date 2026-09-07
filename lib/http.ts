import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requiredEnv } from "./env.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function sendJson(
  response: VercelResponse,
  statusCode: number,
  body: Record<string, unknown>
): void {
  response.status(statusCode).json(body);
}

export function allowMethods(
  request: VercelRequest,
  response: VercelResponse,
  methods: string[]
): boolean {
  if (request.method && methods.includes(request.method)) {
    return true;
  }

  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, { ok: false, error: "method_not_allowed" });
  return false;
}

export function requireAppApiKey(
  request: VercelRequest,
  response: VercelResponse
): boolean {
  let expected: string;
  try {
    expected = requiredEnv("APP_API_KEY");
  } catch (error) {
    sendJson(response, 500, { ok: false, error: "server_not_configured" });
    return false;
  }

  const provided = headerValue(request.headers["x-packpact-api-key"]);
  if (!provided || !timingSafeEqualString(provided, expected)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return false;
  }

  return true;
}

export function routeParam(request: VercelRequest, name: string): string | undefined {
  const value = request.query[name];
  return Array.isArray(value) ? value[0] : value;
}

export function requireUserId(
  request: VercelRequest,
  response: VercelResponse
): string | undefined {
  const userId = routeParam(request, "userId")?.trim();
  if (!userId || !/^[a-zA-Z0-9_-]{6,80}$/.test(userId)) {
    sendJson(response, 400, { ok: false, error: "invalid_user_id" });
    return undefined;
  }
  return userId;
}

export function readJsonBody<T extends object>(request: VercelRequest): T {
  if (!request.body) {
    return {} as T;
  }
  if (typeof request.body === "string") {
    return JSON.parse(request.body) as T;
  }
  return request.body as T;
}

export function formBodyParams(request: VercelRequest): Record<string, string> {
  if (!request.body) {
    return {};
  }
  if (typeof request.body === "string") {
    return Object.fromEntries(new URLSearchParams(request.body).entries());
  }
  if (request.body instanceof URLSearchParams) {
    return Object.fromEntries(request.body.entries());
  }

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.body as Record<string, unknown>)) {
    if (typeof value === "string") {
      params[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      params[key] = String(value);
    }
  }
  return params;
}

export function requestPublicUrl(request: VercelRequest): string {
  const configuredOrigin = process.env.PACKPACT_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const protocol = headerValue(request.headers["x-forwarded-proto"]) ?? "https";
  const host =
    headerValue(request.headers["x-forwarded-host"]) ??
    headerValue(request.headers.host) ??
    "localhost";
  const origin = configuredOrigin ?? `${protocol}://${host}`;
  return new URL(request.url ?? "/", origin).toString();
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
