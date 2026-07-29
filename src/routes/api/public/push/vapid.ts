import { createFileRoute } from "@tanstack/react-router";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export const Route = createFileRoute("/api/public/push/vapid")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      GET: async () =>
        new Response(JSON.stringify({ publicKey: process.env.VAPID_PUBLIC_KEY ?? "" }), { headers: cors }),
    },
  },
});
