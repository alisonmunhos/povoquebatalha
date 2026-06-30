import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({ token: z.string().uuid() });

export const Route = createFileRoute("/api/public/forms/opt-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Content-Type": "application/json" };
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), {
            status: 400,
            headers,
          });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: "Token inválido" }), {
            status: 400,
            headers,
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("opt_out_token", parsed.data.token)
          .maybeSingle();
        if (!contact) {
          return new Response(JSON.stringify({ ok: false, error: "Token não encontrado" }), {
            status: 404,
            headers,
          });
        }
        await supabaseAdmin
          .from("contacts")
          .update({ opt_out_at: new Date().toISOString() })
          .eq("id", contact.id);
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "opted_out" })
          .eq("contact_id", contact.id)
          .in("status", ["queued", "sending"]);
        return new Response(JSON.stringify({ ok: true }), { headers });
      },
    },
  },
});
