import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  nome: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(40),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(120)
    .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use pelo menos uma letra e um número."),
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

export const Route = createFileRoute("/api/public/forms/cadastro-agitador")({
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
          return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente novamente em instantes." }), { status: 429, headers: cors });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }), { status: 400, headers: cors });
        }
        const d = parsed.data;
        if (d.hp) return new Response(JSON.stringify({ ok: true }), { headers: cors });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Normalizar telefone
        const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: d.phone });
        const phoneE164 = norm as string | null;
        if (!phoneE164) {
          return new Response(JSON.stringify({ ok: false, error: "Número de WhatsApp inválido." }), { status: 400, headers: cors });
        }

        // Verificar e-mail já em uso
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if ((existing?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === d.email)) {
          return new Response(JSON.stringify({ ok: false, error: "Este e-mail já está cadastrado. Se você já é agitador, faça login normalmente." }), { status: 409, headers: cors });
        }

        // Criar usuário
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: d.email,
          password: d.password,
          email_confirm: true,
          user_metadata: { full_name: d.nome },
        });
        if (createErr || !created.user) {
          return new Response(JSON.stringify({ ok: false, error: createErr?.message ?? "Erro ao criar conta." }), { status: 400, headers: cors });
        }
        const userId = created.user.id;

        // Marcar profile como pendente_aprovacao
        await supabaseAdmin
          .from("profiles")
          .update({ status: "pendente_aprovacao" })
          .eq("id", userId);

        // Vincular/criar contato
        const { data: contactIdRaw } = await supabaseAdmin.rpc("link_or_create_user_contact", {
          _user_id: userId,
          _email: d.email,
          _phone: d.phone,
          _full_name: d.nome,
        });
        const contactId = contactIdRaw as string | null;

        // Aplicar tag "Agitador pendente" (categoria interno)
        if (contactId) {
          try {
            const TAG_NAME = "Agitador pendente";
            const { data: tag } = await supabaseAdmin
              .from("tags")
              .select("id")
              .eq("nome", TAG_NAME)
              .maybeSingle();
            let tagId = tag?.id as string | undefined;
            if (!tagId) {
              const { data: newTag } = await supabaseAdmin
                .from("tags")
                .insert({ nome: TAG_NAME, cor: "#f97316", categoria: "interno", descricao: "Auto-cadastro aguardando aprovação de admin." })
                .select("id")
                .maybeSingle();
              tagId = newTag?.id as string | undefined;
            }
            if (tagId) {
              await supabaseAdmin
                .from("contact_tags")
                .insert({ contact_id: contactId, tag_id: tagId });
            }
          } catch {
            /* non-blocking */
          }
        }

        // Auditoria
        try {
          await supabaseAdmin.from("access_audit_log").insert({
            actor_id: userId,
            target_user_id: userId,
            event: "agitador_auto_cadastro",
            meta: { email: d.email, phone: phoneE164 },
          });
        } catch {
          /* non-blocking */
        }

        // Envio de WhatsApp de confirmação (não-bloqueante)
        try {
          if (contactId) {
            const { data: c } = await supabaseAdmin
              .from("contacts")
              .select("id,nome,phone_e164,phone_whatsapp_candidate,cidade,bairro,uf,recad_token,consentimento_whatsapp,opt_out_at,whatsapp_status")
              .eq("id", contactId)
              .single();
            if (c) {
              const { sendMessage } = await import("@/lib/wa-send.server");
              await sendMessage({
                contact: c,
                text:
                  `Olá ${d.nome}! Recebemos seu cadastro como agitador(a) da Campanha do Povo que Batalha. ` +
                  `Você receberá acesso ao painel assim que for aprovado por um administrador.`,
                textAlreadyRendered: true,
                origin: "automation",
                skipValidations: true,
              });
            }
          }
        } catch {
          /* non-blocking */
        }

        // Buscar número conectado para o botão "Avisar no WhatsApp"
        let numeroConectado: string | null = null;
        try {
          const { data: inst } = await supabaseAdmin
            .from("whatsapp_instances")
            .select("numero_conectado")
            .eq("provider", "zapi")
            .maybeSingle();
          numeroConectado = inst?.numero_conectado ?? null;
        } catch {
          /* ignore */
        }

        return new Response(
          JSON.stringify({ ok: true, numero_conectado: numeroConectado }),
          { headers: cors },
        );
      },
    },
  },
});
