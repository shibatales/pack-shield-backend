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
      sms: publicSmsAvailability(),
      announcements: [
        {
          id: "build-34-mood-ailments-timers",
          kind: "improvement",
          title: "Build 34 is here",
          detail:
            "Mood and ailments, clearer Home and Den stats, refreshed Shibit visuals, stronger Focus timer alerts, and polish for clocks, stakes, history, and themes.",
          badge: "Build 34",
          icon: "sparkles",
          color: "aqua",
          detailsURL: "https://packshield.app/releases#build-34",
          startsAt: "2026-09-12T00:00:00Z",
          expiresAt: "2026-12-12T00:00:00Z",
          minimumBuildNumber: 34
        }
      ]
    }
  });
}
