import { createFileRoute } from "@tanstack/react-router";
import { handlePublicPushUnsubscribe, pushCorsOptionsResponse } from "@/lib/push-contacts.server";

export const Route = createFileRoute("/api/public/push/unsubscribe")({
  server: {
    handlers: {
      OPTIONS: () => pushCorsOptionsResponse(),
      POST: async ({ request }) => handlePublicPushUnsubscribe(request),
    },
  },
});
