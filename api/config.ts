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
          id: "version-1-5-build-57",
          kind: "feature",
          title: "Version 1.5 is ready",
          detail:
            "Pack Shield now has a cleaner logo splash, more personal pledge and gratitude cards, steadier sober clocks, smoother substance selection, and richer buddy profile polish.",
          badge: "Version 1.5",
          icon: "sparkles",
          color: "solar",
          detailsURL: "https://packshield.app/releases#version-1-5",
          startsAt: "2026-09-19T00:00:00Z",
          expiresAt: "2026-12-19T00:00:00Z",
          minimumBuildNumber: 57
        },
        {
          id: "version-1-4-build-45",
          kind: "feature",
          title: "Version 1.4 is ready",
          detail:
            "Today is calmer, Daily Routine gathers Just For Today actions with reminders and meetings, Games opens straight into play, and All Tools keeps deeper recovery controls nearby.",
          badge: "Version 1.4",
          icon: "sparkles",
          color: "aqua",
          detailsURL: "https://packshield.app/releases#version-1-4",
          startsAt: "2026-09-15T00:00:00Z",
          expiresAt: "2026-12-15T00:00:00Z",
          minimumBuildNumber: 45,
          maximumBuildNumber: 56
        },
        {
          id: "version-1-3-build-44",
          kind: "feature",
          title: "Version 1.3 is ready",
          detail:
            "Gratitude lists, meditation, richer Daily Flow reminders, alternate-look clarity, Shibit XP growth, and a cleaner Care-first Den are now part of your recovery loop.",
          badge: "Version 1.3",
          icon: "sparkles",
          color: "violet",
          detailsURL: "https://packshield.app/releases#version-1-3",
          startsAt: "2026-09-15T00:00:00Z",
          expiresAt: "2026-12-15T00:00:00Z",
          minimumBuildNumber: 44,
          maximumBuildNumber: 44
        },
        {
          id: "version-1-2-build-42",
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
          minimumBuildNumber: 42,
          maximumBuildNumber: 43
        }
      ]
    }
  });
}
