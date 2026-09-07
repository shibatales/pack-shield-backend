import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  allowMethods,
  readJsonBody,
  requireAppApiKey,
  requireUserId,
  sendJson
} from "../../../lib/http.js";
import { recordPackMember, type PackMemberSource } from "../../../lib/store.js";

interface PackMemberBody {
  source?: unknown;
}

const packMemberSources: PackMemberSource[] = ["install", "handler", "sponsor"];

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["POST"])) {
    return;
  }
  if (!requireAppApiKey(request, response)) {
    return;
  }

  const userId = requireUserId(request, response);
  if (!userId) {
    return;
  }

  const body = readJsonBody<PackMemberBody>(request);
  const source = String(body.source ?? "install");
  if (!isPackMemberSource(source)) {
    sendJson(response, 400, { ok: false, error: "invalid_pack_member_source" });
    return;
  }

  sendJson(response, 200, {
    ok: true,
    stats: await recordPackMember(userId, source)
  });
}

function isPackMemberSource(value: string): value is PackMemberSource {
  return packMemberSources.includes(value as PackMemberSource);
}
