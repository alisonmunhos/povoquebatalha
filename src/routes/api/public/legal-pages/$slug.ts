import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/legal-pages/$slug")({
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

      GET: async ({ params }) => {
        const slug = params.slug.trim().toLowerCase();
        if (!slug) {
          return new Response(JSON.stringify({ ok: false, error: "Slug inválido." }), { status: 400, headers: cors });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: page, error } = await supabaseAdmin
          .from("legal_pages")
          .select("slug,title,content,updated_at")
          .eq("slug", slug)
          .maybeSingle();

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: cors });
        }
        if (!page) {
          return new Response(JSON.stringify({ ok: false, error: "Página não encontrada." }), { status: 404, headers: cors });
        }

        return new Response(JSON.stringify({ ok: true, page }), {
          headers: { ...cors, "Cache-Control": "public, max-age=60" },
        });
      },
    },
  },
});
