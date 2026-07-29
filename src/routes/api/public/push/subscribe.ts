import { createFileRoute } from "@tanstack/react-router";
import { handlePublicPushSubscribe, pushCorsOptionsResponse } from "@/lib/push-contacts.server";

export const Route = createFileRoute("/api/public/push/subscribe")({
  server: {
    handlers: {
      OPTIONS: () => pushCorsOptionsResponse(),
      POST: async ({ request }) => handlePublicPushSubscribe(request),
    },
  },
});
