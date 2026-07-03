import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const FORMAS_AJUDA_VALIDAS = [
  // legado (compatibilidade)
  "panfletagem",
  // atuais
  "panfletagem_banquinha",
  "compartilhar_whatsapp",
  "compartilhar_redes",
  "participar_eventos",
  "ajudar_organizacao",
  "mobilizar_bairro",
  "adesivar_carro",
  "plaquinha_casa",
  "receber_panfletos",
  "outro",
] as const;

const schema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  nome_social: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().min(8, "Telefone inválido").max(40),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
  cep: z.string().trim().max(12).optional().or(z.literal("")),
  endereco: z.string().trim().max(240).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  complemento: z.string().trim().max(120).optional().or(z.literal("")),
  referencia: z.string().trim().max(240).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  como_conheceu: z.string().trim().max(240).optional().or(z.literal("")),
  profissao: z.string().trim().max(120).optional().or(z.literal("")),
  coletivo_alicerce: z.boolean().optional(),
  participa_movimento_social: z.boolean().optional(),
  movimento_social_nome: z.string().trim().max(160).optional().or(z.literal("")),
  formas_ajuda: z.array(z.enum(FORMAS_AJUDA_VALIDAS)).max(15).optional(),
  formas_ajuda_outro: z.string().trim().max(240).optional().or(z.literal("")),
  origem_detalhe: z.string().trim().max(80).optional().or(z.literal("")),
  recad_token: z.string().uuid().optional().or(z.literal("")),
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

function getOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : null;
}

export const Route = createFileRoute("/api/public/forms/recadastro")({
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
          return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente em 1 minuto." }), { status: 429, headers: cors });
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

        let target: { id: string; phone_e164: string | null } | null = null;
        if (d.recad_token) {
          const { data } = await supabaseAdmin.from("contacts").select("id,phone_e164").eq("recad_token", d.recad_token).maybeSingle();
          if (data) target = data;
        }
        if (!target) {
          const { data } = await supabaseAdmin.from("contacts").select("id,phone_e164").eq("phone_e164", phoneE164).maybeSingle();
          if (data) target = data;
        }
        if (!target && d.email) {
          const { data } = await supabaseAdmin.from("contacts").select("id,phone_e164").eq("email", d.email).maybeSingle();
          if (data) target = data;
        }

        const formasAjuda = d.formas_ajuda && d.formas_ajuda.length > 0 ? d.formas_ajuda : [];
        const formasAjudaOutro = formasAjuda.includes("outro")
          ? (d.formas_ajuda_outro || null)
          : null;

        const fields = {
          nome: d.nome,
          nome_social: d.nome_social || null,
          phone_raw: d.phone,
          email: d.email || null,
          cidade: d.cidade || null,
          uf: d.uf ? d.uf.toUpperCase() : null,
          cep: d.cep || null,
          endereco: d.endereco || null,
          numero: d.numero || null,
          complemento: d.complemento || null,
          referencia: d.referencia || null,
          bairro: d.bairro || null,
          como_conheceu: d.como_conheceu || null,
          profissao: d.profissao || null,
          coletivo_alicerce: d.coletivo_alicerce ?? null,
          participa_movimento_social: d.participa_movimento_social ?? null,
          movimento_social_nome: d.movimento_social_nome || null,
          formas_ajuda: formasAjuda,
          formas_ajuda_outro: formasAjudaOutro,
          consentimento_whatsapp: true,
          consentimento_at: new Date().toISOString(),
          origem: "recadastro" as const,
          origem_detalhe: d.origem_detalhe || null,
          opt_out_at: null,
          lifecycle_status: "recadastro_concluido" as const,
        };

        let savedId: string | null = null;
        if (target) {
          if (target.phone_e164 && target.phone_e164 !== phoneE164) {
            const { data: newRow } = await supabaseAdmin.from("contacts").insert({ ...fields }).select("id").single();
            if (newRow) {
              savedId = newRow.id;
              await supabaseAdmin.from("contact_duplicates").insert({
                contact_a: newRow.id,
                contact_b: target.id,
                match_type: "provavel",
                reason: "Atualização com telefone diferente do registrado",
              });
              await supabaseAdmin.from("contacts").update({ lifecycle_status: "precisa_revisao" }).eq("id", newRow.id);
            }
          } else {
            await supabaseAdmin.from("contacts").update(fields).eq("id", target.id);
            savedId = target.id;
          }
        } else {
          const { data: newRow } = await supabaseAdmin.from("contacts").insert(fields).select("id").single();
          savedId = newRow?.id ?? null;
        }

        // Registrar origem/captação via tracked link (Bloco B)
        if (savedId && d.ref_token) {
          try {
            const { data: link } = await supabaseAdmin
              .from("tracked_form_links")
              .select("id, created_by_user_id, source_module, source_form_type, is_active, expires_at")
              .eq("token", d.ref_token)
              .maybeSingle();
            const linkExpired = link?.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false;
            if (link && link.is_active && !linkExpired) {
              await supabaseAdmin.rpc("apply_contact_source", {
                _contact_id: savedId,
                _source_user_id: link.created_by_user_id,
                _source_module: link.source_module,
                _source_form_type: link.source_form_type,
                _source_link_id: link.id,
                _event_type: "cadastro_completo",
                _metadata: { via: "recadastro_form" },
              });
            }
          } catch { /* ignore */ }
        }


        if (savedId && (d.cidade || d.cep)) {
          try {
            const { geocodeAddress } = await import("@/lib/cep.server");
            const g = await geocodeAddress({
              endereco: d.endereco, numero: d.numero, bairro: d.bairro,
              cidade: d.cidade, uf: d.uf, cep: d.cep,
            });
            if (g && g.status !== "erro") {
              await supabaseAdmin.from("contacts").update({
                latitude: g.latitude, longitude: g.longitude,
                geocoding_provider: g.provider,
                geocoding_status: g.status === "aproximado" ? "aproximado" : "localizado",
                geocoded_at: new Date().toISOString(),
              }).eq("id", savedId);
            } else {
              await supabaseAdmin.from("contacts").update({ geocoding_status: g ? "erro" : "pendente" }).eq("id", savedId);
            }
          } catch { /* ignore */ }
        }

        // Registra no histórico do contato
        if (savedId) {
          try {
            await supabaseAdmin.from("contact_audit_log").insert({
              contact_id: savedId,
              action: "atualizacao_apoiador_recebida",
              changes: {
                origem_detalhe: d.origem_detalhe || null,
                coletivo_alicerce: d.coletivo_alicerce ?? null,
                participa_movimento_social: d.participa_movimento_social ?? null,
                movimento_social_nome: d.movimento_social_nome || null,
                profissao: d.profissao || null,
                formas_ajuda: formasAjuda,
                formas_ajuda_outro: formasAjudaOutro,
                consentimento_whatsapp: true,
                cidade: d.cidade || null, bairro: d.bairro || null, uf: d.uf || null,
              },
            });
          } catch { /* ignore */ }
        }

        // Dispara automações (se houver)
        if (savedId) {
          try {
            const { data: c } = await supabaseAdmin.from("contacts")
              .select("id,nome,phone_e164,cidade,bairro,recad_token,consentimento_whatsapp,opt_out_at,arquivado_at")
              .eq("id", savedId).single();
            if (c) {
              const { triggerAutomationsForEvent } = await import("@/lib/automations.server");
              await triggerAutomationsForEvent({
                eventKey: "atualizacao_apoiador_concluida",
                contact: c,
                origin: getOrigin(request),
              });
            }
          } catch { /* ignore */ }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      },
    },
  },
});
