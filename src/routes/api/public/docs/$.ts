import { createFileRoute } from "@tanstack/react-router";

// Serve PDFs from the private "public-docs" bucket under a stable system URL.
export const Route = createFileRoute("/api/public/docs/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params._splat ?? "").replace(/^\/+/, "");
        if (!path || path.includes("..") || !path.toLowerCase().endsWith(".pdf")) {
          return new Response("Arquivo inválido.", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("public-docs").download(path);
        if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 });
        const name = path.split("/").pop() ?? "documento.pdf";
        return new Response(data.stream(), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
