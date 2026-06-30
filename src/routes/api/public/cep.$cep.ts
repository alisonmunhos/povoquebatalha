import { createFileRoute } from "@tanstack/react-router";
import { lookupCep } from "@/lib/cep.server";

export const Route = createFileRoute("/api/public/cep/$cep")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const data = await lookupCep(params.cep);
        if (!data) {
          return new Response(JSON.stringify({ ok: false, error: "CEP não encontrado" }), {
            status: 404,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        }
        return new Response(JSON.stringify({ ok: true, data }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
