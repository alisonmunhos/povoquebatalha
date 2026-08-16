import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH_VERSION = "v23.0";

const SELECT =
  "id,name,language,category,body_text,variable_labels,example_values,header_type,header_text,footer_text,meta_template_id,status,rejected_reason,created_at,updated_at";

export const TEMPLATE_VARIABLES = [
  "primeiro_nome",
  "nome",
  "cidade",
  "bairro",
  "link_atualizacao",
  "link_inscricao",
] as const;

export type WhatsappTemplateRow = {
  id: string;
  name: string;
  language: string;
  category: string;
  body_text: string;
  variable_labels: string[];
  example_values: string[];
  header_type: string;
  header_text: string | null;
  footer_text: string | null;
  meta_template_id: string | null;
  status: string;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
};

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x ?? ""))) : [];
}

/** Lista todos os templates oficiais, mais recentes primeiro. */
export const listWhatsappTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ templates: WhatsappTemplateRow[] }> => {
    const { data, error } = await context.supabase
      .from("whatsapp_templates")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const templates = (data ?? []).map((r) => ({
      ...r,
      variable_labels: toStringArray(r.variable_labels),
      example_values: toStringArray(r.example_values),
    })) as WhatsappTemplateRow[];
    return { templates };
  });

const draftSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Use apenas minúsculas, números e underscore."),
  language: z.string().trim().min(2).max(10).default("pt_BR"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  body_text: z.string().trim().min(1).max(1024),
  variable_labels: z.array(z.string().trim().max(60)).default([]),
  example_values: z.array(z.string().trim().max(200)).default([]),
  header_type: z.enum(["NONE", "TEXT"]).default("NONE"),
  header_text: z.string().trim().max(60).nullable().default(null),
  footer_text: z.string().trim().max(60).nullable().default(null),
});

/** Cria ou atualiza um rascunho. Só permite editar registros em status 'draft'. */
export const saveWhatsappTemplateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    const row = {
      ...payload,
      header_text: payload.header_type === "TEXT" ? payload.header_text : null,
      status: "draft" as const,
    };

    if (id) {
      const { data: current, error: readErr } = await context.supabase
        .from("whatsapp_templates")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!current) throw new Error("Modelo não encontrado.");
      if (current.status !== "draft") {
        throw new Error(
          "Este modelo já foi enviado para a Meta e não pode mais ser editado. Crie um novo modelo.",
        );
      }
      const { error } = await context.supabase
        .from("whatsapp_templates")
        .update(row)
        .eq("id", id);
      if (error) throw error;
      return { id };
    }

    const { data: created, error } = await context.supabase
      .from("whatsapp_templates")
      .insert({ ...row, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: created.id };
  });

/** Apaga apenas rascunhos. */
export const deleteWhatsappTemplateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: current, error: readErr } = await context.supabase
      .from("whatsapp_templates")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!current) throw new Error("Modelo não encontrado.");
    if (current.status !== "draft") {
      throw new Error("Só é possível excluir modelos que ainda são rascunho.");
    }
    const { error } = await context.supabase
      .from("whatsapp_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

type SubmitResult =
  | { ok: true; meta_template_id: string; status: "pending" }
  | { ok: false; error: string };

/** Envia o rascunho para aprovação na Meta (POST /{WABA_ID}/message_templates). */
export const submitWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SubmitResult> => {
    const token = process.env["WHATSAPP_TOKEN"];
    if (!token) {
      return { ok: false, error: "Falta o segredo WHATSAPP_TOKEN para falar com a Meta." };
    }

    const { data: tpl, error: readErr } = await context.supabase
      .from("whatsapp_templates")
      .select(SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!tpl) return { ok: false, error: "Modelo não encontrado." };
    if (tpl.status !== "draft") {
      return { ok: false, error: "Este modelo já foi enviado para a Meta." };
    }

    const { data: inst } = await context.supabase
      .from("whatsapp_instances")
      .select("config")
      .eq("provider", "whatsapp_cloud")
      .limit(1)
      .maybeSingle();
    const cfg = (inst?.config ?? {}) as Record<string, unknown>;
    const wabaId = typeof cfg["waba_id"] === "string" ? (cfg["waba_id"] as string) : null;
    if (!wabaId) {
      return {
        ok: false,
        error: "WABA ID não configurado na instância oficial do WhatsApp.",
      };
    }

    const examples = toStringArray(tpl.example_values);
    const components: Array<Record<string, unknown>> = [];
    if (tpl.header_type !== "NONE" && tpl.header_text) {
      components.push({ type: "HEADER", format: tpl.header_type, text: tpl.header_text });
    }
    const body: Record<string, unknown> = { type: "BODY", text: tpl.body_text };
    if (examples.length > 0) body["example"] = { body_text: [examples] };
    components.push(body);
    if (tpl.footer_text) components.push({ type: "FOOTER", text: tpl.footer_text });

    let errorMessage: string | null = null;
    let metaId: string | null = null;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: tpl.name,
            language: tpl.language,
            category: tpl.category,
            components,
          }),
        },
      );
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        json = null;
      }
      const err = json?.["error"] as { message?: string; error_user_msg?: string } | undefined;
      if (!res.ok || err) {
        errorMessage =
          err?.error_user_msg ?? err?.message ?? `A Meta respondeu HTTP ${res.status}`;
      } else {
        metaId = typeof json?.["id"] === "string" ? (json["id"] as string) : null;
        if (!metaId) errorMessage = "A Meta aceitou a requisição, mas não devolveu o id do modelo.";
      }
    } catch (e) {
      errorMessage =
        e instanceof Error ? `Não foi possível falar com a Meta: ${e.message}` : "Falha de rede.";
    }

    if (errorMessage || !metaId) {
      await context.supabase
        .from("whatsapp_templates")
        .update({ rejected_reason: errorMessage, status: "draft" })
        .eq("id", tpl.id);
      return { ok: false, error: errorMessage ?? "Falha ao enviar o modelo." };
    }

    const { error: updErr } = await context.supabase
      .from("whatsapp_templates")
      .update({ meta_template_id: metaId, status: "pending", rejected_reason: null })
      .eq("id", tpl.id);
    if (updErr) throw updErr;

    return { ok: true, meta_template_id: metaId, status: "pending" };
  });
