import type { VercelRequest, VercelResponse } from "@vercel/node";
import { allowMethods, sendJson } from "../lib/http.js";
import { publicSmsAvailability } from "../lib/twilio.js";

export default function handler(
  request: VercelRequest,
  response: VercelResponse
): void {
  if (!allowMethods(request, response, ["GET"])) {
    return;
  }

  sendJson(response, 200, {
    ok: true,
    config: {
      sms: publicSmsAvailability()
    }
  });
}
