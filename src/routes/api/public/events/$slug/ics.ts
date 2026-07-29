import { createFileRoute } from "@tanstack/react-router";
import { handlePublicEventIcs } from "@/lib/events-public.server";

export const Route = createFileRoute("/api/public/events/$slug/ics")({
  server: {
    handlers: {
      GET: async ({ params }) => handlePublicEventIcs(params.slug),
    },
  },
});
