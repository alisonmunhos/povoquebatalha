import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  redirectOrigin: z.string().url(),
});

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Dados inválidos." }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Bloqueia se já existir qualquer admin
        const { count, error: cErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "admin");
        if (cErr) return Response.json({ error: cErr.message }, { status: 500 });
        if ((count ?? 0) > 0) {
          return Response.json(
            { error: "Já existe um administrador. Use a tela de Usuários para convidar." },
            { status: 403 },
          );
        }

        const redirectTo = `${parsed.data.redirectOrigin.replace(/\/+$/, "")}/aceitar-convite`;
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          parsed.data.email,
          { redirectTo },
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const userId = data.user?.id;
        if (userId) {
          await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
