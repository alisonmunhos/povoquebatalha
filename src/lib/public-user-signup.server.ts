// Lógica compartilhada de auto-cadastro público de usuário do sistema (sem link
// mágico, sem expiração) — usada tanto pelo formulário genérico
// (/cadastro-usuario, qualquer um dos 5 papéis não-admin) quanto pelo formulário
// fixo de agitador (/cadastro-agitador, papel sempre forçado para "agitador"),
// para não duplicar a criação de conta entre os dois handlers.
import { z } from "zod";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";
import { PUBLIC_SIGNUP_ROLES, ROLE_LABEL, type AppRole } from "@/lib/roles";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export function corsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

const bodySchema = z.object({
  nome: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(40),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(120)
    .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use pelo menos uma letra e um número."),
  role: z.enum(PUBLIC_SIGNUP_ROLES).optional(),
  ...honeypotSchema,
});

export async function handleUserSignup(request: Request, opts: { rateLimitKey: string; forcedRole?: AppRole }): Promise<Response> {
  if (isRateLimited(opts.rateLimitKey)) {
    return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas. Tente novamente em instantes." }), { status: 429, headers: cors });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400, headers: cors });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }), { status: 400, headers: cors });
  }
  const d = parsed.data;
  if (isHoneypotTripped(d.hp)) return new Response(JSON.stringify({ ok: true }), { headers: cors });

  const requestedRole: AppRole | null = opts.forcedRole ?? d.role ?? null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: d.phone });
  const phoneE164 = norm as string | null;
  if (!phoneE164) {
    return new Response(JSON.stringify({ ok: false, error: "Número de WhatsApp inválido." }), { status: 400, headers: cors });
  }

  const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if ((existing?.users ?? []).some((u: { email?: string | null }) => (u.email ?? "").toLowerCase() === d.email)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Este e-mail já está cadastrado. Se você já tem conta, faça login normalmente." }),
      { status: 409, headers: cors },
    );
  }

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

  await supabaseAdmin
    .from("profiles")
    .update({ status: "pendente_aprovacao", requested_role: requestedRole })
    .eq("id", userId);

  const { data: contactIdRaw } = await supabaseAdmin.rpc("link_or_create_user_contact", {
    _user_id: userId,
    _email: d.email,
    _phone: d.phone,
    _full_name: d.nome,
  });
  const contactId = contactIdRaw as string | null;

  if (contactId) {
    try {
      await supabaseAdmin.rpc("apply_contact_source", {
        _contact_id: contactId,
        _source_user_id: null as unknown as string,
        _source_module: "formulario_publico",
        _source_form_type: "cadastro_completo",
        _source_link_id: null as unknown as string,
        _event_type: "cadastro_completo",
        _metadata: { via: "cadastro_usuario", requested_role: requestedRole },
      });
    } catch {
      /* non-blocking */
    }
  }

  if (contactId) {
    try {
      const roleLabel = requestedRole ? ROLE_LABEL[requestedRole] : "Usuário";
      const TAG_NAME = `${roleLabel} pendente`;
      const { data: tag } = await supabaseAdmin.from("tags").select("id").eq("nome", TAG_NAME).maybeSingle();
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
        await supabaseAdmin.from("contact_tags").insert({ contact_id: contactId, tag_id: tagId });
      }
    } catch {
      /* non-blocking */
    }
  }

  try {
    await supabaseAdmin.from("access_audit_log").insert({
      actor_id: userId,
      target_user_id: userId,
      event: "usuario_auto_cadastro",
      meta: { email: d.email, phone: phoneE164, requested_role: requestedRole },
    });
  } catch {
    /* non-blocking */
  }

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
          text: `Olá ${d.nome}! Recebemos seu cadastro na Campanha do Povo que Batalha. Você receberá acesso ao painel assim que for aprovado por um administrador.`,
          textAlreadyRendered: true,
          origin: "automation",
          skipValidations: true,
        });
      }
    }
  } catch {
    /* non-blocking */
  }

  let whatsappPhone: string | null = null;
  try {
    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("numero_conectado, config")
      .eq("provider", "zapi")
      .maybeSingle();
    const cfg = (inst?.config ?? {}) as Record<string, unknown>;
    // Prioriza o valor configurado manualmente; se não houver, cai para o número
    // atualmente conectado na instância Z-API (padrão dinâmico).
    whatsappPhone =
      (cfg.signup_whatsapp_phone as string | undefined) ??
      (inst?.numero_conectado ?? null);
  } catch {
    /* ignore — mantém o padrão */
  }

  return new Response(JSON.stringify({ ok: true, whatsapp_phone: whatsappPhone }), { headers: cors });
}

export { getRequestIp };
