// Server fns para links rastreáveis (Bloco B).
// createTrackedLink: exige auth; gera token nanoid-like e registra origem/tipo.
// resolveTrackedLink: público (via server publishable client) para os formulários.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SOURCE_MODULES = [
  "gestao_base",
  "territorio",
  "agitacao",
  "mapa",
  "inbox",
  "ficha_contato",
  "relacionamento",
  "link_publico",
] as const;
const SOURCE_FORM_TYPES = ["cadastro_completo", "receber_informacoes"] as const;

// Gera token URL-safe de 24 chars (sem depender de nanoid).
function genToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

const createSchema = z.object({
  source_module: z.enum(SOURCE_MODULES),
  source_form_type: z.enum(SOURCE_FORM_TYPES),
  label: z.string().trim().max(120).optional().nullable(),
});

export const createTrackedLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const token = genToken();
    const { data: row, error } = await context.supabase
      .from("tracked_form_links")
      .insert({
        token,
        created_by_user_id: context.userId,
        source_module: data.source_module,
        source_form_type: data.source_form_type,
        label: data.label ?? null,
        is_active: true,
      })
      .select("id, token, source_module, source_form_type, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { link: row };
  });

// Público — usado pelos handlers dos formulários para validar o token.
// Não usa auth-middleware; roda com o publishable key (server-side).
export const resolveTrackedLinkPublic = async (token: string) => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.rpc("resolve_tracked_link", { _token: token });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return row as {
    id: string;
    source_module: (typeof SOURCE_MODULES)[number];
    source_form_type: (typeof SOURCE_FORM_TYPES)[number];
    is_active: boolean;
    expired: boolean;
    created_by_name: string | null;
  };
};

// Lista os últimos links criados pelo usuário logado (para reuso rápido).
export const listMyTrackedLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("tracked_form_links")
      .select("id, token, source_module, source_form_type, label, use_count, created_at, is_active")
      .eq("created_by_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return { links: data ?? [] };
  });
