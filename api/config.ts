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
          id: "version-1-2-build-43",
          kind: "improvement",
          title: "Version 1.2 is ready",
          detail:
            "Daily Flow now tracks Daily XP, collapses into a swipeable row, keeps Rescue as support status, and brings clearer action colors plus a richer Pledge button.",
          badge: "Version 1.2",
          icon: "sparkles",
          color: "aqua",
          detailsURL: "https://packshield.app/releases#version-1-2",
          startsAt: "2026-09-13T00:00:00Z",
          expiresAt: "2026-12-14T00:00:00Z",
          minimumBuildNumber: 43
        }
      ]
    }
  });
}
