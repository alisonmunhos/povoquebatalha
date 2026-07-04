// Cria contato "na hora" a partir do agitador/operador logado.
// Compartilha a lógica dos endpoints públicos /inscrever e /atualizacao:
// - normaliza telefone via RPC normalize_phone_br
// - reaproveita contato existente por phone_e164 (upsert leve)
// - registra origem/captação via apply_contact_source, com source_user_id = usuário logado
// - opcionalmente marca lifecycle_status
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SOURCE_MODULES = [
  "gestao_base", "territorio", "agitacao", "mapa",
  "inbox", "ficha_contato", "relacionamento", "link_publico",
] as const;

const schema = z.object({
  form_type: z.enum(["cadastro_completo", "receber_informacoes"]),
  source_module: z.enum(SOURCE_MODULES),
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().min(8, "Telefone inválido").max(40),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().max(2).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  endereco: z.string().trim().max(240).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  cep: z.string().trim().max(12).optional().or(z.literal("")),
  observacoes: z.string().trim().max(2000).optional().or(z.literal("")),
  consentimento_whatsapp: z.boolean(),
});

export const createInlineContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    if (!data.consentimento_whatsapp) {
      throw new Error("É preciso confirmar a autorização de contato por WhatsApp.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: data.phone });
    const phoneE164 = norm as string | null;
    if (!phoneE164) throw new Error("Telefone inválido.");

    const isFull = data.form_type === "cadastro_completo";
    const fields = {
      nome: data.nome,
      phone_raw: data.phone,
      email: data.email || null,
      cidade: data.cidade || null,
      uf: data.uf ? data.uf.toUpperCase() : null,
      bairro: data.bairro || null,
      endereco: isFull ? (data.endereco || null) : null,
      numero: isFull ? (data.numero || null) : null,
      cep: isFull ? (data.cep || null) : null,
      observacoes: data.observacoes || null,
      consentimento_whatsapp: true,
      consentimento_at: new Date().toISOString(),
      origem: (isFull ? "recadastro" : "inscricao") as "recadastro" | "inscricao",
      origem_detalhe: "preenchido_por_agitador",
      opt_out_at: null,
      lifecycle_status: (isFull ? "recadastro_concluido" : "recadastro_concluido") as const,
    };

    // Procurar contato existente por phone_e164 (evita duplicar).
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    let savedId: string | null = null;
    if (existing) {
      await supabaseAdmin.from("contacts").update(fields).eq("id", existing.id);
      savedId = existing.id;
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("contacts")
        .insert(fields)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      savedId = ins?.id ?? null;
    }
    if (!savedId) throw new Error("Falha ao salvar contato.");

    // Registrar origem/captação com o usuário logado como source_user_id.
    try {
      await supabaseAdmin.rpc("apply_contact_source", {
        _contact_id: savedId,
        _source_user_id: context.userId,
        _source_module: data.source_module,
        _source_form_type: data.form_type,
        _source_link_id: null,
        _event_type: isFull ? "cadastro_completo" : "inscricao_simples",
        _metadata: { via: "preenchido_por_agitador" },
      });
    } catch { /* non-blocking */ }

    return { ok: true as const, contact_id: savedId };
  });
