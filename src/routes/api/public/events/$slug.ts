import { createFileRoute } from "@tanstack/react-router";
import { eventsCorsOptionsResponse, handlePublicGetEvent } from "@/lib/events-public.server";

export const Route = createFileRoute("/api/public/events/$slug")({
  server: {
    handlers: {
      OPTIONS: () => eventsCorsOptionsResponse(),
      GET: async ({ request, params }) => handlePublicGetEvent(request, params.slug),
    },
  },
});
