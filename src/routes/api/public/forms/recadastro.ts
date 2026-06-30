import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().min(8, "Telefone inválido").max(40),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
  cep: z.string().trim().max(12).optional().or(z.literal("")),
  endereco: z.string().trim().max(240).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  como_conheceu: z.string().trim().max(240).optional().or(z.literal("")),
  quer_voluntariar: z.boolean().optional(),
  origem_detalhe: z.string().trim().max(80).optional().or(z.literal("")),
  recad_token: z.string().uuid().optional().or(z.literal("")),
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

        // 1) Try to resolve target contact: token first, then phone, then email
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

        const fields = {
          nome: d.nome,
          phone_raw: d.phone,
          email: d.email || null,
          cidade: d.cidade || null,
          uf: d.uf ? d.uf.toUpperCase() : null,
          cep: d.cep || null,
          endereco: d.endereco || null,
          numero: d.numero || null,
          bairro: d.bairro || null,
          como_conheceu: d.como_conheceu || null,
          quer_voluntariar: d.quer_voluntariar ?? null,
          consentimento_whatsapp: true,
          origem: "recadastro" as const,
          origem_detalhe: d.origem_detalhe || null,
          opt_out_at: null,
          lifecycle_status: "recadastro_concluido" as const,
        };

        if (target) {
          // Non-destructive merge + phone change detection
          if (target.phone_e164 && target.phone_e164 !== phoneE164) {
            // create a duplicate record for review instead of overwriting
            const { data: newRow } = await supabaseAdmin.from("contacts").insert({ ...fields }).select("id").single();
            if (newRow) {
              await supabaseAdmin.from("contact_duplicates").insert({
                contact_a: newRow.id,
                contact_b: target.id,
                match_type: "provavel",
                reason: "Recadastro com telefone diferente do registrado",
              });
              await supabaseAdmin.from("contacts").update({ lifecycle_status: "precisa_revisao" }).eq("id", newRow.id);
            }
          } else {
            await supabaseAdmin.from("contacts").update(fields).eq("id", target.id);
          }
        } else {
          await supabaseAdmin.from("contacts").insert(fields);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      },
    },
  },
});
