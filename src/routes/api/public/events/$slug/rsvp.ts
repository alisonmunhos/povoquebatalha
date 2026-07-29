import { createFileRoute } from "@tanstack/react-router";
import { eventsCorsOptionsResponse, handlePublicEventRsvp } from "@/lib/events-public.server";

export const Route = createFileRoute("/api/public/events/$slug/rsvp")({
  server: {
    handlers: {
      OPTIONS: () => eventsCorsOptionsResponse(),
      POST: async ({ request, params }) => handlePublicEventRsvp(request, params.slug),
    },
  },
});
