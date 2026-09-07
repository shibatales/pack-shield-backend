import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, sendJson } from "../../lib/http.js";
import { publicPackStats } from "../../lib/store.js";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
): Promise<void> {
  if (!allowMethods(request, response, ["GET"])) {
    return;
  }

  sendJson(response, 200, {
    ok: true,
    stats: await publicPackStats()
  });
}
