import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  nome: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(40),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
  origem_detalhe: z.string().trim().max(80).optional().or(z.literal("")),
  ref_token: z.string().trim().min(8).max(48).optional().or(z.literal("")),
  consentimento_whatsapp: z.literal(true, {
    errorMap: () => ({ message: "É preciso autorizar o contato por WhatsApp." }),
  }),
  hp: z.string().max(0).optional(),
});

const rateLimit = new Map<string, { count: number; reset: number }>();
function isRateLimited(ip: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.reset < now) {
    rateLimit.set(ip, { count: 1, reset: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export const Route = createFileRoute("/api/public/forms/inscrever")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("cf-connecting-ip") ||
          "unknown";
        if (isRateLimited(ip)) {
          return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas." }), { status: 429, headers: cors });
        }
        let body: unknown;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }), { status: 400, headers: cors });
        }
        const d = parsed.data;
        if (d.hp) return new Response(JSON.stringify({ ok: true }), { headers: cors });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: d.phone });
        const phoneE164 = norm as string | null;
        if (!phoneE164) {
          return new Response(JSON.stringify({ ok: false, error: "Telefone inválido" }), { status: 400, headers: cors });
        }
        const { data: existing } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("phone_e164", phoneE164)
          .maybeSingle();
        const payload = {
          nome: d.nome,
          phone_raw: d.phone,
          cidade: d.cidade || null,
          uf: d.uf ? d.uf.toUpperCase() : null,
          consentimento_whatsapp: true,
          origem: "inscricao" as const,
          origem_detalhe: d.origem_detalhe || null,
          tipo_contato: "lista_divulgacao",
          lifecycle_status: "recadastro_concluido" as const,
          opt_out_at: null,
        };
        let savedId: string | null = null;
        if (existing) {
          await supabaseAdmin.from("contacts").update(payload).eq("id", existing.id);
          savedId = existing.id;
        } else {
          const { data: ins } = await supabaseAdmin.from("contacts").insert(payload).select("id").single();
          savedId = ins?.id ?? null;
        }
        // Registrar origem/captação via tracked link (Bloco B), com fallback
        // para módulo + data quando não há link rastreável ativo.
        if (savedId) {
          try {
            const { data: link } = d.ref_token
              ? await supabaseAdmin
                  .from("tracked_form_links")
                  .select("id, created_by_user_id, source_module, source_form_type, is_active, expires_at")
                  .eq("token", d.ref_token)
                  .maybeSingle()
              : { data: null };
            const linkExpired = link?.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false;
            if (link && link.is_active && !linkExpired) {
              await supabaseAdmin.rpc("apply_contact_source", {
                _contact_id: savedId,
                _source_user_id: link.created_by_user_id,
                _source_module: link.source_module,
                _source_form_type: link.source_form_type,
                _source_link_id: link.id,
                _event_type: "inscricao_simples",
                _metadata: { via: "inscricao_form" },
              });
            } else {
              await supabaseAdmin.rpc("apply_contact_source", {
                _contact_id: savedId,
                _source_user_id: null as unknown as string,
                _source_module: "formulario_publico",
                _source_form_type: "receber_informacoes",
                _source_link_id: null as unknown as string,
                _event_type: "inscricao_simples",
                _metadata: { via: "inscricao_form_sem_ref" },
              });
            }
          } catch { /* ignore */ }
        }
        if (savedId) {
          try {
            const origin = request.headers.get("origin") ||
              (request.headers.get("host") ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host")}` : null);
            const { data: c } = await supabaseAdmin.from("contacts")
              .select("id,nome,phone_e164,cidade,bairro,recad_token,consentimento_whatsapp,opt_out_at,arquivado_at")
              .eq("id", savedId).single();
            if (c) {
              const { triggerAutomationsForEvent } = await import("@/lib/automations.server");
              await triggerAutomationsForEvent({ eventKey: "inscricao_concluida", contact: c, origin });
            }
          } catch { /* ignore */ }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      },
    },
  },
});
