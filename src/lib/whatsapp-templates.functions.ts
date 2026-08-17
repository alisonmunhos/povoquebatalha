import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH_VERSION = "v23.0";

const SELECT =
  "id,name,language,category,body_text,example_values,parameter_format,source,header_type,header_text,header_example,footer_text,meta_template_id,status,rejected_reason,created_at,updated_at";

export const TEMPLATE_VARIABLES = [
  "primeiro_nome",
  "nome",
  "cidade",
  "bairro",
  "link_atualizacao",
  "link_inscricao",
] as const;

/** Extrai, na ordem de aparição e sem repetir, as variáveis nomeadas de um texto. */
export function extractNamedVars(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\{\{([a-z_]+)\}\}/g)) {
    const name = m[1]!;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

export type WhatsappTemplateRow = {
  id: string;
  name: string;
  language: string;
  category: string;
  body_text: string;
  example_values: Record<string, string>;
  parameter_format: string;
  source: string;
  header_type: string;
  header_text: string | null;
  header_example: string | null;
  footer_text: string | null;
  meta_template_id: string | null;
  status: string;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
};

function toStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[k] = typeof val === "string" ? val : String(val ?? "");
  }
  return out;
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
      example_values: toStringMap(r.example_values),
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
  example_values: z.record(z.string(), z.string().trim().max(200)).default({}),
  header_type: z.enum(["NONE", "TEXT"]).default("NONE"),
  header_text: z.string().trim().max(60).nullable().default(null),
  header_example: z.string().trim().max(200).nullable().default(null),
  footer_text: z.string().trim().max(60).nullable().default(null),
});

/** Cria ou atualiza um rascunho. Só permite editar registros em status 'draft'. */
export const saveWhatsappTemplateDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    const isText = payload.header_type === "TEXT";
    const row = {
      ...payload,
      header_text: isText ? payload.header_text : null,
      header_example: isText ? payload.header_example : null,
      parameter_format: "named" as const,
      source: "app" as const,
      status: "draft" as const,
    };

    if (id) {
      const { data: current, error: readErr } = await context.supabase
        .from("whatsapp_templates")
        .select("status,source,parameter_format")
        .eq("id", id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!current) throw new Error("Modelo não encontrado.");
      if (current.status !== "draft") {
        throw new Error(
          "Este modelo já foi enviado para a Meta e não pode mais ser editado. Crie um novo modelo.",
        );
      }
      if (current.source !== "app" || current.parameter_format !== "named") {
        throw new Error(
          "Modelos importados da Meta com variáveis numeradas não podem ser editados por aqui.",
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

async function readWabaId(
  supabase: { from: (t: "whatsapp_instances") => any },
): Promise<string | null> {
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("config")
    .eq("provider", "whatsapp_cloud")
    .limit(1)
    .maybeSingle();
  const cfg = (inst?.config ?? {}) as Record<string, unknown>;
  return typeof cfg["waba_id"] === "string" ? (cfg["waba_id"] as string) : null;
}

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

    const wabaId = await readWabaId(context.supabase);
    if (!wabaId) {
      return {
        ok: false,
        error: "WABA ID não configurado na instância oficial do WhatsApp.",
      };
    }

    const examples = toStringMap(tpl.example_values);
    const components: Array<Record<string, unknown>> = [];

    if (tpl.header_type === "TEXT" && tpl.header_text) {
      const headerVars = extractNamedVars(tpl.header_text);
      const header: Record<string, unknown> = {
        type: "HEADER",
        format: "TEXT",
        text: tpl.header_text,
      };
      const headerVar = headerVars[0];
      if (headerVar) {
        header["example"] = {
          header_text_named_params: [
            { param_name: headerVar, example: tpl.header_example ?? examples[headerVar] ?? "" },
          ],
        };
      }
      components.push(header);
    }

    const bodyVars = extractNamedVars(tpl.body_text);
    const body: Record<string, unknown> = { type: "BODY", text: tpl.body_text };
    if (bodyVars.length > 0) {
      body["example"] = {
        body_text_named_params: bodyVars.map((name) => ({
          param_name: name,
          example: examples[name] ?? "",
        })),
      };
    }
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
            parameter_format: "named",
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

const META_STATUS: Record<string, string> = {
  APPROVED: "approved",
  PENDING: "pending",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
  IN_APPEAL: "pending",
  PENDING_DELETION: "disabled",
};

type MetaComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: {
    body_text?: unknown;
    body_text_named_params?: Array<{ param_name?: string; example?: string }>;
    header_text?: unknown;
    header_text_named_params?: Array<{ param_name?: string; example?: string }>;
  };
};

type ImportResult =
  | { ok: true; imported: number; existing: number }
  | { ok: false; error: string };

/** Importa para o app os templates que já existem na conta da Meta. */
export const importWhatsappTemplatesFromMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImportResult> => {
    const token = process.env["WHATSAPP_TOKEN"];
    if (!token) {
      return { ok: false, error: "Falta o segredo WHATSAPP_TOKEN para falar com a Meta." };
    }
    const wabaId = await readWabaId(context.supabase);
    if (!wabaId) {
      return { ok: false, error: "WABA ID não configurado na instância oficial do WhatsApp." };
    }

    let list: Array<Record<string, unknown>> = [];
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=id,name,language,category,status,components&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as Record<string, unknown>;
      const err = json?.["error"] as { message?: string; error_user_msg?: string } | undefined;
      if (!res.ok || err) {
        return {
          ok: false,
          error: err?.error_user_msg ?? err?.message ?? `A Meta respondeu HTTP ${res.status}`,
        };
      }
      list = Array.isArray(json["data"]) ? (json["data"] as Array<Record<string, unknown>>) : [];
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? `Não foi possível falar com a Meta: ${e.message}` : "Falha de rede.",
      };
    }

    const { data: current, error: readErr } = await context.supabase
      .from("whatsapp_templates")
      .select("name,language");
    if (readErr) throw readErr;
    const known = new Set((current ?? []).map((r) => `${r.name}|${r.language}`));

    let imported = 0;
    let existing = 0;

    for (const t of list) {
      const name = typeof t["name"] === "string" ? t["name"] : null;
      const language = typeof t["language"] === "string" ? t["language"] : null;
      if (!name || !language) continue;
      const key = `${name}|${language}`;
      if (known.has(key)) {
        existing += 1;
        continue;
      }

      const components = (Array.isArray(t["components"]) ? t["components"] : []) as MetaComponent[];
      const bodyComp = components.find((c) => c.type?.toUpperCase() === "BODY");
      const headerComp = components.find((c) => c.type?.toUpperCase() === "HEADER");
      const footerComp = components.find((c) => c.type?.toUpperCase() === "FOOTER");

      const namedParams = bodyComp?.example?.body_text_named_params;
      const hasNamed = Array.isArray(namedParams) && namedParams.length > 0;
      const hasPositional = Array.isArray(bodyComp?.example?.body_text);
      const parameter_format = hasNamed ? "named" : hasPositional ? "positional" : "named";

      const example_values: Record<string, string> = {};
      if (hasNamed) {
        for (const p of namedParams!) {
          if (p?.param_name) example_values[p.param_name] = p.example ?? "";
        }
      }

      const headerNamed = headerComp?.example?.header_text_named_params;
      const headerExample =
        Array.isArray(headerNamed) && headerNamed[0]?.example ? headerNamed[0].example : null;

      const headerIsText = (headerComp?.format ?? "").toUpperCase() === "TEXT";

      const { error: insErr } = await context.supabase.from("whatsapp_templates").insert({
        name,
        language,
        category: typeof t["category"] === "string" ? (t["category"] as string) : "UTILITY",
        status: META_STATUS[String(t["status"] ?? "").toUpperCase()] ?? "pending",
        meta_template_id: typeof t["id"] === "string" ? (t["id"] as string) : null,
        source: "meta_import",
        parameter_format,
        body_text: bodyComp?.text ?? "",
        header_type: headerIsText ? "TEXT" : "NONE",
        header_text: headerIsText ? (headerComp?.text ?? null) : null,
        header_example: headerExample,
        footer_text: footerComp?.text ?? null,
        example_values,
        created_by: context.userId,
      });
      if (insErr) throw insErr;
      known.add(key);
      imported += 1;
    }

    return { ok: true, imported, existing };
  });
