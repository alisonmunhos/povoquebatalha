// Server fns do cadastro "na hora" (usadas por AddContactButton).
// - quickSaveContact: cria/upsert com só nome+phone. Não dispara automação.
// - completeInlineContact: atualiza a ficha completa (formas de ajuda, endereço,
//   Coletivo Alicerce obrigatório) e dispara a mesma automação
//   "atualizacao_apoiador_concluida" que o /recadastro público.
// Ambos registram origem via apply_contact_source com source_user_id = usuário logado.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SOURCE_MODULES = [
  "gestao_base", "territorio", "agitacao", "mapa",
  "inbox", "ficha_contato", "relacionamento", "link_publico",
] as const;

const quickSchema = z.object({
  source_module: z.enum(SOURCE_MODULES),
  form_type: z.enum(["cadastro_completo", "receber_informacoes"]),
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  phone: z.string().trim().min(8, "Telefone inválido").max(40),
});

export const quickSaveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => quickSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: data.phone });
    const phoneE164 = norm as string | null;
    if (!phoneE164) throw new Error("Telefone inválido.");

    const isFull = data.form_type === "cadastro_completo";
    const baseFields = {
      nome: data.nome,
      phone_raw: data.phone,
      consentimento_whatsapp: true,
      consentimento_at: new Date().toISOString(),
      origem: (isFull ? "recadastro" : "inscricao") as "recadastro" | "inscricao",
      origem_detalhe: "preenchido_por_agitador",
      opt_out_at: null,
    };

    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    let savedId: string;
    if (existing) {
      await supabaseAdmin.from("contacts").update(baseFields).eq("id", existing.id);
      savedId = existing.id;
    } else {
      const { data: ins, error } = await supabaseAdmin
        .from("contacts")
        .insert(baseFields)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!ins?.id) throw new Error("Falha ao salvar contato.");
      savedId = ins.id;
    }

    try {
      await supabaseAdmin.rpc("apply_contact_source", {
        _contact_id: savedId,
        _source_user_id: context.userId,
        _source_module: data.source_module,
        _source_form_type: data.form_type,
        _source_link_id: null as unknown as string,
        _event_type: existing ? "contato_atualizado" : "contato_criado",
        _metadata: { via: "preenchido_por_agitador", stage: "quick" },
      });
    } catch { /* non-blocking */ }

    return { ok: true as const, contact_id: savedId };
  });

const completeSchema = z.object({
  contact_id: z.string().uuid(),
  source_module: z.enum(SOURCE_MODULES),
  form_type: z.enum(["cadastro_completo", "receber_informacoes"]),
  nome: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(40),
  email: z.string().trim().max(255).optional().or(z.literal("")),
  profissao: z.string().trim().max(120).optional().or(z.literal("")),
  cep: z.string().trim().max(12).optional().or(z.literal("")),
  endereco: z.string().trim().max(240).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  complemento: z.string().trim().max(120).optional().or(z.literal("")),
  referencia: z.string().trim().max(240).optional().or(z.literal("")),
  bairro: z.string().trim().max(120).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  uf: z.string().trim().max(2).optional().or(z.literal("")),
  como_conheceu: z.string().trim().max(240).optional().or(z.literal("")),
  observacoes: z.string().trim().max(2000).optional().or(z.literal("")),
  formas_ajuda: z.array(z.string().max(60)).max(20).default([]),
  formas_ajuda_outro: z.string().trim().max(240).optional().or(z.literal("")),
  coletivo_alicerce: z.boolean({ required_error: "Informe se faz parte do Coletivo Alicerce" }),
});

export const completeInlineContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const updates = {
      nome: data.nome,
      phone_raw: data.phone,
      email: data.email || null,
      profissao: data.profissao || null,
      cep: data.cep || null,
      endereco: data.endereco || null,
      numero: data.numero || null,
      complemento: data.complemento || null,
      referencia: data.referencia || null,
      bairro: data.bairro || null,
      cidade: data.cidade || null,
      uf: data.uf ? data.uf.toUpperCase() : null,
      como_conheceu: data.como_conheceu || null,
      observacoes: data.observacoes || null,
      formas_ajuda: data.formas_ajuda,
      formas_ajuda_outro: data.formas_ajuda_outro || null,
      coletivo_alicerce: data.coletivo_alicerce,
      lifecycle_status: "recadastro_concluido" as const,
      origem_detalhe: "preenchido_por_agitador",
    };

    const { error } = await supabaseAdmin
      .from("contacts")
      .update(updates)
      .eq("id", data.contact_id);
    if (error) throw new Error(error.message);

    try {
      await supabaseAdmin.rpc("apply_contact_source", {
        _contact_id: data.contact_id,
        _source_user_id: context.userId,
        _source_module: data.source_module,
        _source_form_type: data.form_type,
        _source_link_id: null as unknown as string,
        _event_type: data.form_type === "cadastro_completo" ? "cadastro_completo" : "inscricao_simples",
        _metadata: { via: "preenchido_por_agitador", stage: "complete" },
      });
    } catch { /* non-blocking */ }

    // Dispara a mesma automação do /recadastro público.
    try {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("id,nome,nome_social,phone_e164,cidade,bairro,recad_token,consentimento_whatsapp,opt_out_at,arquivado_at")
        .eq("id", data.contact_id)
        .single();
      if (c) {
        const { triggerAutomationsForEvent } = await import("@/lib/automations.server");
        await triggerAutomationsForEvent({
          eventKey: "atualizacao_apoiador_concluida",
          contact: c,
          origin: null,
        });
      }
    } catch { /* non-blocking */ }

    return { ok: true as const, contact_id: data.contact_id };
  });

// Mantido por compatibilidade (usado antes; hoje o fluxo é quick + complete).
// Se algum consumidor ainda importar, funciona como create rápido.
export const createInlineContact = quickSaveContact;
