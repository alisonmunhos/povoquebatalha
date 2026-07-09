// CRUD autenticado da aba "Entrada de Dados" (construtor de formulários personalizados).
// A leitura pública (sem auth) do formulário publicado vive em
// src/routes/api/public/forms/$slug.ts, seguindo o mesmo padrão dos demais
// formulários públicos (que também não usam server functions autenticadas).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, requireAdmin } from "@/lib/authz";
import { insertTrackedLink } from "@/lib/tracked-links.functions";
import { CORE_CATALOG_FIELDS } from "@/lib/form-field-catalog";
import type { Database } from "@/integrations/supabase/types";

type TemplateRow = Database["public"]["Tables"]["message_templates"]["Row"];
type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];
type TrackedLinkRow = Pick<
  Database["public"]["Tables"]["tracked_form_links"]["Row"],
  "id" | "token" | "use_count" | "is_active"
>;

export const listFormDefinitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("form_definitions")
      .select("id,title,slug,is_active,is_fixed,source_form_type,created_at")
      .order("is_fixed", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getFormDefinition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data: form, error } = await context.supabase
      .from("form_definitions")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: questions } = await context.supabase
      .from("form_definition_questions")
      .select("*")
      .eq("form_definition_id", data.id)
      .order("order_index", { ascending: true });
    let template: TemplateRow | null = null;
    let automation: AutomationRow | null = null;
    if (form.event_key) {
      const { data: tpl } = await context.supabase
        .from("message_templates")
        .select("*")
        .eq("event_key", form.event_key)
        .eq("kind", "system")
        .is("archived_at", null)
        .maybeSingle();
      template = tpl ?? null;
      const { data: auto } = await context.supabase
        .from("automations")
        .select("*")
        .eq("event_key", form.event_key)
        .maybeSingle();
      automation = auto ?? null;
    }
    let trackedLink: TrackedLinkRow | null = null;
    if (form.tracked_form_link_id) {
      const { data: link } = await context.supabase
        .from("tracked_form_links")
        .select("id,token,use_count,is_active")
        .eq("id", form.tracked_form_link_id)
        .maybeSingle();
      trackedLink = link ?? null;
    }
    return { form, questions: questions ?? [], template, automation, trackedLink };
  });

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen."),
  source_form_type: z.enum(["cadastro_completo", "receber_informacoes"]),
});

export const createFormDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    // Sugere como padrão inicial o número atualmente conectado na instância Z-API;
    // continua editável na tela do formulário. O DEFAULT da coluna cobre o caso
    // de não haver instância conectada.
    const { data: inst } = await context.supabase
      .from("whatsapp_instances")
      .select("numero_conectado")
      .eq("provider", "zapi")
      .maybeSingle();
    const defaultPhone = (inst?.numero_conectado ?? "").trim();
    const { data: row, error } = await context.supabase
      .from("form_definitions")
      .insert({
        title: data.title,
        slug: data.slug,
        source_form_type: data.source_form_type,
        event_key: `formulario:${data.slug}`,
        created_by: context.userId,
        ...(defaultPhone ? { whatsapp_button_phone: defaultPhone } : {}),
      })
      .select()
      .single();
    if (error) throw error;

    // Semeia as perguntas core (nome/WhatsApp/consentimento) para o formulário nunca
    // ficar num estado "sem perguntas" antes de quem monta clicar em salvar.
    await context.supabase.from("form_definition_questions").insert(
      CORE_CATALOG_FIELDS.map((f, i) => ({
        form_definition_id: row.id,
        order_index: i,
        source: "catalog" as const,
        catalog_field_key: f.key,
        label: f.defaultLabel,
        help_text: f.defaultHelpText ?? null,
        required: true,
      })),
    );
    return row;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  is_active: z.boolean().optional(),
  whatsapp_button_enabled: z.boolean().optional(),
  whatsapp_button_message: z.string().trim().max(500).nullable().optional(),
  whatsapp_button_phone: z.string().trim().min(8).max(30).optional(),
  source_form_type: z.enum(["cadastro_completo", "receber_informacoes"]).optional(),
  success_screen_order: z.enum(["whatsapp_first", "confirmation_first"]).optional(),
});

export const updateFormDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("form_definitions")
      .update({ ...rest, updated_by: context.userId })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteFormDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: form, error: formErr } = await context.supabase
      .from("form_definitions")
      .select("is_fixed")
      .eq("id", data.id)
      .single();
    if (formErr) throw formErr;
    if (form.is_fixed) throw new Error("Este formulário é fixo (recadastro/inscrever) e não pode ser excluído.");
    const { error } = await context.supabase.from("form_definitions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const questionSchema = z.object({
  id: z.string().uuid().optional(),
  order_index: z.number().int().min(0),
  source: z.enum(["catalog", "custom"]),
  catalog_field_key: z.string().trim().max(60).nullable().optional(),
  label: z.string().trim().min(1).max(200),
  help_text: z.string().trim().max(400).nullable().optional(),
  required: z.boolean().default(false),
});

const upsertQuestionsSchema = z.object({
  form_definition_id: z.string().uuid(),
  questions: z.array(questionSchema).max(60),
});

/**
 * Salva a lista de perguntas do formulário, preservando o `id` das perguntas que
 * já existiam (edição in-place) — importante para perguntas customizadas, cujo `id`
 * é a chave estrangeira de `form_custom_answers`. Recriar o id a cada salvamento
 * apagaria (via ON DELETE CASCADE) as respostas já coletadas para essas perguntas.
 * Só perguntas removidas da lista são de fato excluídas (e suas respostas com elas).
 */
export const upsertFormQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertQuestionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const keepIds = data.questions.map((q) => q.id).filter((id): id is string => Boolean(id));
    if (keepIds.length > 0) {
      await context.supabase
        .from("form_definition_questions")
        .delete()
        .eq("form_definition_id", data.form_definition_id)
        .not("id", "in", `(${keepIds.join(",")})`);
    } else {
      await context.supabase.from("form_definition_questions").delete().eq("form_definition_id", data.form_definition_id);
    }

    for (const q of data.questions) {
      const row = {
        form_definition_id: data.form_definition_id,
        order_index: q.order_index,
        source: q.source,
        catalog_field_key: q.catalog_field_key ?? null,
        label: q.label,
        help_text: q.help_text ?? null,
        required: q.required,
      };
      if (q.id) {
        const { error } = await context.supabase.from("form_definition_questions").update(row).eq("id", q.id);
        if (error) throw error;
      } else {
        const { error } = await context.supabase.from("form_definition_questions").insert(row);
        if (error) throw error;
      }
    }
    return { ok: true };
  });

const confirmationSchema = z.object({
  form_definition_id: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(4000),
  link: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
  require_consent: z.boolean().default(true),
});

/** Configura a mensagem de confirmação, reaproveitando message_templates/automations
 * já existentes (mesmo mecanismo usado pelo resto do app) — sem CRUD paralelo. */
export const saveFormConfirmationMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmationSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: form, error: formErr } = await context.supabase
      .from("form_definitions")
      .select("event_key")
      .eq("id", data.form_definition_id)
      .single();
    if (formErr) throw formErr;

    const { data: existingTpl } = await context.supabase
      .from("message_templates")
      .select("id")
      .eq("event_key", form.event_key)
      .eq("kind", "system")
      .maybeSingle();

    const tplPayload = {
      kind: "system" as const,
      event_key: form.event_key,
      title: data.title,
      body: data.body,
      link: data.link ?? null,
      variables: [] as string[],
      active: data.active,
      updated_by: context.userId,
    };
    let templateId: string;
    if (existingTpl) {
      const { data: row, error } = await context.supabase
        .from("message_templates").update(tplPayload).eq("id", existingTpl.id).select("id").single();
      if (error) throw error;
      templateId = row.id;
    } else {
      const { data: row, error } = await context.supabase
        .from("message_templates").insert({ ...tplPayload, created_by: context.userId }).select("id").single();
      if (error) throw error;
      templateId = row.id;
    }

    const { data: existingAuto } = await context.supabase
      .from("automations")
      .select("id")
      .eq("event_key", form.event_key)
      .maybeSingle();
    const autoPayload = {
      event_key: form.event_key,
      template_id: templateId,
      active: data.active,
      require_consent: data.require_consent,
      updated_by: context.userId,
    };
    if (existingAuto) {
      const { error } = await context.supabase.from("automations").update(autoPayload).eq("id", existingAuto.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("automations").insert({ ...autoPayload, created_by: context.userId });
      if (error) throw error;
    }
    return { ok: true, template_id: templateId };
  });

/** Gera (ou reaproveita) um link rastreável para o formulário, via o mesmo
 * mecanismo de tracked_form_links usado em "Adicionar contato". */
export const mintFormTrackedLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ form_definition_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: form, error: formErr } = await context.supabase
      .from("form_definitions")
      .select("id,slug,title,source_form_type,tracked_form_link_id")
      .eq("id", data.form_definition_id)
      .single();
    if (formErr) throw formErr;
    if (form.tracked_form_link_id) {
      const { data: link } = await context.supabase
        .from("tracked_form_links")
        .select("id,token")
        .eq("id", form.tracked_form_link_id)
        .maybeSingle();
      if (link) return { link };
    }
    const link = await insertTrackedLink(context.supabase, context.userId, {
      source_module: "link_publico",
      source_form_type: form.source_form_type,
      label: form.title,
    });
    await context.supabase.from("form_definitions").update({ tracked_form_link_id: link.id }).eq("id", form.id);
    return { link };
  });

/** Gera o QR code (PNG, data URL) do link público do formulário, server-side. */
export const getFormQrCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().url().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const QRCode = await import("qrcode");
    const dataUrl = await QRCode.toDataURL(data.url, { width: 320, margin: 1 });
    return { dataUrl };
  });
