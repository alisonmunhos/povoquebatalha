// Gera uma imagem Open Graph horizontal (1200x630) a partir da imagem de
// cabeçalho do formulário. O letterbox preserva cartões verticais inteiros —
// o WhatsApp corta mal imagens em retrato cruas.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/forms/$slug/og-image")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: form } = await supabaseAdmin
          .from("form_definitions")
          .select("header_image_path,header_image_mime,is_active,updated_at")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!form || !form.is_active || !form.header_image_path) {
          return new Response("Sem imagem", { status: 404 });
        }

        const { data: file, error } = await supabaseAdmin.storage
          .from("campaign-media")
          .download(form.header_image_path);
        if (error || !file) return new Response("Sem imagem", { status: 404 });

        const { createOpenGraphJpeg } = await import("@/lib/og-image.server");
        const image = await createOpenGraphJpeg(file);

        if (!image) {
          return new Response(file, {
            headers: {
              "Content-Type": form.header_image_mime || file.type || "image/jpeg",
              "Cache-Control": "public, max-age=3600, s-maxage=86400",
              "Access-Control-Allow-Origin": "*",
              "X-Preview-Image": "original-header",
            },
          });
        }

        return new Response(image, {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Length": String(image.byteLength),
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Access-Control-Allow-Origin": "*",
            "X-Preview-Image": "open-graph-1200x630",
            "Last-Modified": form.updated_at ? new Date(form.updated_at).toUTCString() : new Date().toUTCString(),
          },
        });
      },
    },
  },
});
