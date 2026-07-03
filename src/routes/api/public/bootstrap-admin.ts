import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  setup_secret: z.string().min(16).max(200),
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function adminExists() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

function getSelfOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : null;
}

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const exists = await adminExists();
          return Response.json({ exists });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Erro." },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Dados inválidos." }, { status: 400 });
        }

        const expectedSecret = process.env.BOOTSTRAP_ADMIN_SECRET ?? "";
        if (!expectedSecret || !safeEqual(parsed.data.setup_secret, expectedSecret)) {
          return Response.json(
            { error: "Segredo de inicialização inválido." },
            { status: 401 },
          );
        }

        if (await adminExists()) {
          return Response.json(
            { error: "Já existe um administrador. Use a tela de Usuários para convidar." },
            { status: 403 },
          );
        }

        const selfOrigin = getSelfOrigin(request);
        if (!selfOrigin) {
          return Response.json({ error: "Origem inválida." }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const redirectTo = `${selfOrigin}/aceitar-convite`;
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

