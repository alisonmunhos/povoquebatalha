// Lógica compartilhada de auto-cadastro público de usuário do sistema (sem link
// mágico, sem expiração) — usada pelo formulário genérico (/cadastro-usuario),
// pelo fixo de agitador (/cadastro-agitador) e pela seção "Criar conta" dos
// formulários por etapas.
import { z } from "zod";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";
import { isEmailAlreadyRegistered } from "@/lib/public-form-contact.server";
import { PUBLIC_SIGNUP_ROLES, ROLE_LABEL, type AppRole } from "@/lib/roles";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const CADASTRO_ALICERCE_FORM_ID = "a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91";

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

export type CreatePendingUserInput = {
  nome: string;
  phone: string;
  email: string;
  password: string;
  requestedRole: AppRole | null;
  via: string;
  sendWelcomeWhatsApp?: boolean;
  request?: Request;
};

export type CreatePendingUserResult =
  | { ok: true; userId: string; contactId: string | null; nextStepUrl: string | null }
  | { ok: false; code: "email_already_registered"; error: string }
  | { ok: false; code: "invalid_phone"; error: string }
  | { ok: false; code: "create_failed"; error: string };

export async function createPendingUserFromSignup(input: CreatePendingUserInput): Promise<CreatePendingUserResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: input.phone });
  const phoneE164 = norm as string | null;
  if (!phoneE164) {
    return { ok: false, code: "invalid_phone", error: "Número de WhatsApp inválido." };
  }

  if (await isEmailAlreadyRegistered(input.email)) {
    return {
      ok: false,
      code: "email_already_registered",
      error: "Este e-mail já está cadastrado. Se você já tem conta, faça login normalmente.",
    };
  }

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.nome },
  });
  if (createErr || !created.user) {
    return { ok: false, code: "create_failed", error: createErr?.message ?? "Erro ao criar conta." };
  }
  const userId = created.user.id;
  const requestedRole = input.requestedRole;

  await supabaseAdmin
    .from("profiles")
    .update({ status: "pendente_aprovacao", requested_role: requestedRole })
    .eq("id", userId);

  const { data: contactIdRaw } = await supabaseAdmin.rpc("link_or_create_user_contact", {
    _user_id: userId,
    _email: input.email,
    _phone: input.phone,
    _full_name: input.nome,
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
        _metadata: { via: input.via, requested_role: requestedRole },
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
      meta: { email: input.email, phone: phoneE164, requested_role: requestedRole },
    });
  } catch {
    /* non-blocking */
  }

  let nextStepUrl: string | null = null;
  if (input.sendWelcomeWhatsApp !== false && contactId) {
    try {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("id,nome,phone_e164,phone_whatsapp_candidate,cidade,bairro,uf,recad_token,consentimento_whatsapp,opt_out_at,whatsapp_status")
        .eq("id", contactId)
        .single();
      if (c && input.request) {
        const origin =
          input.request.headers.get("origin") ||
          (input.request.headers.get("host")
            ? `${input.request.headers.get("x-forwarded-proto") ?? "https"}://${input.request.headers.get("host")}`
            : null);
        if (origin && c.recad_token) {
          const { data: alicerceForm } = await supabaseAdmin
            .from("form_definitions")
            .select("slug,is_active")
            .eq("id", CADASTRO_ALICERCE_FORM_ID)
            .maybeSingle();
          if (alicerceForm?.is_active) {
            nextStepUrl = `${origin}/f/${alicerceForm.slug}?t=${c.recad_token}`;
          }
        }

        const { sendMessage } = await import("@/lib/wa-send.server");
        const stepText = nextStepUrl
          ? `\n\nPra completar sua ficha de apoiador (endereço, como você pode ajudar, etc.), acesse: ${nextStepUrl}`
          : "";
        await sendMessage({
          contact: c,
          text: `Olá ${input.nome}! Recebemos seu cadastro na Campanha do Povo que Batalha. Você receberá acesso ao painel assim que for aprovado por um administrador.${stepText}`,
          textAlreadyRendered: true,
          origin: "automation",
          skipValidations: true,
        });
      }
    } catch {
      /* non-blocking */
    }
  }

  return { ok: true, userId, contactId, nextStepUrl };
}

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

  const result = await createPendingUserFromSignup({
    nome: d.nome,
    phone: d.phone,
    email: d.email,
    password: d.password,
    requestedRole,
    via: opts.forcedRole === "agitador" ? "cadastro_agitador" : "cadastro_usuario",
    request,
  });

  if (!result.ok) {
    if (result.code === "email_already_registered") {
      return new Response(
        JSON.stringify({ ok: false, code: result.code, error: result.error }),
        { status: 409, headers: cors },
      );
    }
    return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 400, headers: cors });
  }

  let whatsappPhone: string | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inst } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("numero_conectado, config")
      .eq("provider", "zapi")
      .maybeSingle();
    const cfg = (inst?.config ?? {}) as Record<string, unknown>;
    whatsappPhone =
      (cfg.signup_whatsapp_phone as string | undefined) ??
      (inst?.numero_conectado ?? null);
  } catch {
    /* ignore */
  }

  return new Response(
    JSON.stringify({ ok: true, whatsapp_phone: whatsappPhone, next_step_url: result.nextStepUrl }),
    { headers: cors },
  );
}

export { getRequestIp };
