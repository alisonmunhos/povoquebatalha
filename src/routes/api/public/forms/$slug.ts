// Handler genérico para qualquer formulário criado no construtor ("Entrada de Dados").
// GET  /api/public/forms/$slug  → definição pública do formulário (perguntas ordenadas).
// POST /api/public/forms/$slug  → submissão: upsert de contato + apply_contact_source +
//                                  automação de confirmação, no mesmo padrão de
//                                  /api/public/forms/{inscrever,recadastro}.ts.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildSourceMetadata } from "@/lib/contact-source-metadata";
import { getCatalogField, type FormCatalogField } from "@/lib/form-field-catalog";
import {
  getEffectiveQuestionShape,
  labelForCustomOptionValue,
  type CustomOption,
} from "@/lib/form-question-shape";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";
import { isLegalConsentCatalogKey } from "@/lib/legal-consent-fields";
import { getSectionsOnPath, isAnswerEmpty, sortSections } from "@/lib/form-sections-routing";

// Só usado quando form.prefill_from_token está ligado (opt-in, ver migration) —
// lê o valor já existente do contato pra virar valor inicial da pergunta,
// no mesmo formato que PublicFormRenderer espera em `values[questionId]`.
function catalogValueFromContact(
  catalog: FormCatalogField,
  contact: Record<string, unknown>,
): unknown {
  if (catalog.responseType === "address_block") {
    const v: Record<string, unknown> = {};
    for (const col of catalog.targetColumns) {
      if (contact[col] != null && contact[col] !== "") v[col] = contact[col];
    }
    return Object.keys(v).length ? v : undefined;
  }
  const raw = contact[catalog.targetColumns[0]];
  if (catalog.filterKind === "multiselect") {
    return Array.isArray(raw) && raw.length ? raw : undefined;
  }
  if (catalog.filterKind === "boolean") {
    return typeof raw === "boolean" ? raw : undefined;
  }
  return raw != null && raw !== "" ? raw : undefined;
}

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const addressBlockSchema = z.object({
  cep: z.string().trim().max(12).optional(),
  endereco: z.string().trim().max(240).optional(),
  numero: z.string().trim().max(20).optional(),
  complemento: z.string().trim().max(120).optional(),
  bairro: z.string().trim().max(120).optional(),
  referencia: z.string().trim().max(240).optional(),
  cidade: z.string().trim().max(120).optional(),
  uf: z.string().trim().max(2).optional(),
});

const submitSchema = z.object({
  ref_token: z.string().trim().min(8).max(48).optional().or(z.literal("")),
  recad_token: z.string().uuid().optional().or(z.literal("")),
  terminal_section_id: z.string().uuid().optional().or(z.literal("")),
  start_section_id: z.string().uuid().optional().or(z.literal("")),
  /** Quando o formulário é aberto pela tela de um evento: registra presença junto. */
  event_slug: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  event_rsvp_status: z.enum(["confirmed", "declined"]).optional(),
  answers: z.record(
    z.string().uuid(),
    z.union([z.string(), z.array(z.string()), z.boolean(), z.null(), addressBlockSchema]),
  ),
  ...honeypotSchema,
});


type QuestionRow = {
  id: string;
  order_index: number;
  source: "catalog" | "custom";
  catalog_field_key: string | null;
  label: string;
  help_text: string | null;
  required: boolean;
  link_text: string | null;
  link_url: string | null;
  section_id: string | null;
  custom_response_type: string | null;
  custom_options: CustomOption[] | null;
};

function enrichQuestions(rows: QuestionRow[]) {
  return rows.map((q) => {
    const shape = getEffectiveQuestionShape(q);
    return {
      id: q.id,
      section_id: q.section_id,
      source: q.source,
      label: q.label,
      help_text: q.help_text,
      required: q.required,
      link_text: q.link_text,
      link_url: q.link_url,
      response_type: shape.response_type,
      filter_kind: shape.filter_kind,
      options: shape.options,
      depends_on:
        q.source === "catalog" && q.catalog_field_key
          ? getCatalogField(q.catalog_field_key)?.dependsOn ?? null
          : null,
      catalog_field_key: q.catalog_field_key,
      custom_response_type: q.custom_response_type,
      custom_options: q.custom_options,
    };
  });
}

export const Route = createFileRoute("/api/public/forms/$slug")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),

      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form, error: formErr } = await supabaseAdmin
          .from("form_definitions")
          .select("id,title,is_active,whatsapp_button_enabled,prefill_from_token,layout_mode")
          .eq("slug", params.slug)
          .eq("is_active", true)
          .maybeSingle();
        if (formErr) {
          console.error(`[public-form GET ${params.slug}] erro ao carregar formulário:`, formErr);
          return new Response(
            JSON.stringify({ ok: false, error: `Erro ao carregar formulário: ${formErr.message}` }),
            { status: 500, headers: cors },
          );
        }
        if (!form) {
          return new Response(JSON.stringify({ ok: false, error: "Formulário não encontrado." }), { status: 404, headers: cors });
        }
        const { data: questions } = await supabaseAdmin
          .from("form_definition_questions")
          .select("id,order_index,source,catalog_field_key,label,help_text,required,link_text,link_url,section_id,custom_response_type,custom_options")
          .eq("form_definition_id", form.id)
          .order("order_index", { ascending: true });

        const enriched = enrichQuestions((questions ?? []) as QuestionRow[]);
        const layoutMode = (form as { layout_mode?: string }).layout_mode ?? "flat";

        let sections: Array<{
          id: string;
          order_index: number;
          title: string | null;
          section_type: string;
          account_creation_role: string | null;
          description: string | null;
          default_next_section_id: string | null;
          confirmation_active: boolean | null;
          whatsapp_button_enabled: boolean | null;
          whatsapp_button_message: string | null;
          whatsapp_button_phone: string | null;
          success_screen_order: string | null;
        }> = [];
        let branchRules: Array<{ question_id: string; option_value: string; next_section_id: string | null }> = [];

        if (layoutMode === "sectioned") {
          const { data: sectionRows } = await supabaseAdmin
            .from("form_sections")
            .select("id,order_index,title,section_type,account_creation_role,description,default_next_section_id,confirmation_active,whatsapp_button_enabled,whatsapp_button_message,whatsapp_button_phone,success_screen_order")
            .eq("form_definition_id", form.id)
            .order("order_index", { ascending: true });
          sections = sectionRows ?? [];

          const questionIds = (questions ?? []).map((q) => q.id);
          if (questionIds.length > 0) {
            const { data: rules } = await supabaseAdmin
              .from("form_question_branch_rules")
              .select("question_id,option_value,next_section_id")
              .in("question_id", questionIds);
            branchRules = rules ?? [];
          }
        }

        let initialValues: Record<string, unknown> | undefined;
        let contactContext: { email: string | null; nome: string | null; phone: string | null; email_already_registered: boolean; has_account: boolean } | null = null;
        const url = new URL(request.url);
        const token = url.searchParams.get("t");
        if (token) {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("*")
            .eq("recad_token", token)
            .maybeSingle();
          if (contact) {
            if (form.prefill_from_token) {
              initialValues = {};
              for (const q of (questions ?? []) as QuestionRow[]) {
                if (q.source !== "catalog" || !q.catalog_field_key) continue;
                const catalog = getCatalogField(q.catalog_field_key);
                if (!catalog) continue;
                const v = catalogValueFromContact(catalog, contact as Record<string, unknown>);
                if (v !== undefined) initialValues[q.id] = v;
              }
            }
            const { isEmailAlreadyRegistered } = await import("@/lib/public-form-contact.server");
            const email = (contact.email as string | null)?.trim().toLowerCase() || null;
            // Já é usuário do sistema? Então não pedimos pra criar conta de novo.
            let hasAccount = Boolean((contact as { is_system_user?: boolean }).is_system_user);
            if (!hasAccount) {
              const { data: prof } = await supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("contact_id", contact.id as string)
                .maybeSingle();
              hasAccount = Boolean(prof);
            }
            contactContext = {
              email,
              nome: (contact.nome as string | null) ?? null,
              phone: (contact.phone_raw as string | null) ?? (contact.phone_e164 as string | null) ?? null,
              email_already_registered: email ? await isEmailAlreadyRegistered(email) : false,
              has_account: hasAccount,
            };
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            form: {
              id: form.id,
              title: form.title,
              layout_mode: layoutMode,
              whatsapp_button_enabled: form.whatsapp_button_enabled,
              questions: enriched,
              sections: layoutMode === "sectioned" ? sections : null,
              branch_rules: layoutMode === "sectioned" ? branchRules : null,
              initial_values: initialValues ?? null,
              contact_context: contactContext,
              start_section_id: layoutMode === "sectioned"
                ? (url.searchParams.get("s") || sections[0]?.id || null)
                : null,
            },
          }),
          { headers: cors },
        );
      },

      POST: async ({ request, params }) => {
        const ip = getRequestIp(request);
        if (isRateLimited(`form:${params.slug}:${ip}`)) {
          return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas." }), { status: 429, headers: cors });
        }
        let body: unknown;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), { status: 400, headers: cors });
        }
        const parsed = submitSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" }), { status: 400, headers: cors });
        }
        const d = parsed.data;
        if (isHoneypotTripped(d.hp)) return new Response(JSON.stringify({ ok: true }), { headers: cors });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: form, error: formErr } = await supabaseAdmin
          .from("form_definitions")
          .select("id,slug,title,tracking_name,is_active,source_form_type,event_key,tracked_form_link_id,whatsapp_button_enabled,whatsapp_button_message,whatsapp_button_phone,success_screen_order,push_button_enabled,layout_mode")
          .eq("slug", params.slug)
          .eq("is_active", true)
          .maybeSingle();
        if (formErr) {
          console.error(`[public-form POST ${params.slug}] erro ao carregar formulário:`, formErr);
          return new Response(
            JSON.stringify({ ok: false, error: `Erro ao carregar formulário: ${formErr.message}` }),
            { status: 500, headers: cors },
          );
        }
        if (!form) {
          return new Response(JSON.stringify({ ok: false, error: "Formulário não encontrado." }), { status: 404, headers: cors });
        }
        const { data: questions } = await supabaseAdmin
          .from("form_definition_questions")
          .select("id,order_index,source,catalog_field_key,label,help_text,required,link_text,link_url,section_id,custom_response_type,custom_options")
          .eq("form_definition_id", form.id)
          .order("order_index", { ascending: true });

        const layoutMode = (form as { layout_mode?: string }).layout_mode ?? "flat";
        const isSectioned = layoutMode === "sectioned";

        type AddressAnswer = { cep?: string; endereco?: string; numero?: string; complemento?: string; bairro?: string; referencia?: string; cidade?: string; uf?: string };
        const answers = d.answers as Record<string, string | string[] | boolean | AddressAnswer | null>;
        const isAddressAnswer = (v: unknown): v is AddressAnswer =>
          typeof v === "object" && v !== null && !Array.isArray(v);

        let sectionPathIds: Set<string> | null = null;
        if (isSectioned) {
          const { data: sectionRows } = await supabaseAdmin
            .from("form_sections")
            .select("id,order_index,default_next_section_id")
            .eq("form_definition_id", form.id)
            .order("order_index", { ascending: true });
          const sections = sortSections(sectionRows ?? []);
          const questionIds = (questions ?? []).map((q) => q.id);
          let branchRules: Array<{ question_id: string; option_value: string; next_section_id: string | null }> = [];
          if (questionIds.length > 0) {
            const { data: rules } = await supabaseAdmin
              .from("form_question_branch_rules")
              .select("question_id,option_value,next_section_id")
              .in("question_id", questionIds);
            branchRules = rules ?? [];
          }

          const terminalId = d.terminal_section_id || null;
          if (!terminalId) {
            return new Response(JSON.stringify({ ok: false, error: "Seção final não informada." }), { status: 400, headers: cors });
          }

          const startId =
            d.start_section_id && sections.some((s) => s.id === d.start_section_id)
              ? d.start_section_id
              : sections[0]?.id;
          if (!startId) {
            return new Response(JSON.stringify({ ok: false, error: "Formulário sem seções." }), { status: 400, headers: cors });
          }

          const path = getSectionsOnPath(
            startId,
            terminalId,
            sections,
            (questions ?? []) as QuestionRow[],
            branchRules,
            answers,
          );
          if (path[path.length - 1] !== terminalId) {
            return new Response(JSON.stringify({ ok: false, error: "Fluxo de seções inválido." }), { status: 400, headers: cors });
          }
          sectionPathIds = new Set(path);
        }

        let terminalSection: {
          confirmation_active: boolean | null;
          whatsapp_button_enabled: boolean | null;
          whatsapp_button_message: string | null;
          whatsapp_button_phone: string | null;
          success_screen_order: string | null;
          push_button_enabled: boolean | null;
          linked_event_id: string | null;
        } | null = null;
        if (isSectioned && d.terminal_section_id) {
          const { data: sec } = await supabaseAdmin
            .from("form_sections")
            .select("confirmation_active,whatsapp_button_enabled,whatsapp_button_message,whatsapp_button_phone,success_screen_order,push_button_enabled,linked_event_id")
            .eq("id", d.terminal_section_id)
            .eq("form_definition_id", form.id)
            .maybeSingle();
          terminalSection = sec ?? null;
        }

        // Valida obrigatoriedade e localiza nome/telefone (sempre presentes no catálogo core).
        let nome: string | null = null;
        let phoneRaw: string | null = null;
        let email: string | null = null;
        let consentimento = false;
        const contactPayload: Record<string, unknown> = {};
        const customAnswers: { question_id: string; question_label: string; answer_text: string }[] = [];

        for (const q of (questions ?? []) as QuestionRow[]) {
          if (sectionPathIds && (!q.section_id || !sectionPathIds.has(q.section_id))) continue;

          const value = answers[q.id];
          const isEmpty = isAnswerEmpty(value);
          if (q.required && isEmpty) {
            return new Response(JSON.stringify({ ok: false, error: `Campo obrigatório: ${q.label}` }), { status: 400, headers: cors });
          }
          if (isEmpty) continue;

          if (q.source === "custom") {
            const shape = getEffectiveQuestionShape(q);
            let answerText = String(value);
            if (shape.response_type === "multiple_choice") {
              if (typeof value !== "string" || !value.trim()) {
                if (q.required) {
                  return new Response(JSON.stringify({ ok: false, error: `Campo obrigatório: ${q.label}` }), { status: 400, headers: cors });
                }
                continue;
              }
              const allowed = (q.custom_options ?? []).some((o) => o.value === value);
              if (!allowed) {
                return new Response(JSON.stringify({ ok: false, error: `Resposta inválida: ${q.label}` }), { status: 400, headers: cors });
              }
              answerText = labelForCustomOptionValue(q.custom_options, value);
            }
            customAnswers.push({ question_id: q.id, question_label: q.label, answer_text: answerText });
            continue;
          }

          const catalog = q.catalog_field_key ? getCatalogField(q.catalog_field_key) : undefined;
          if (!catalog) continue;

          if (catalog.key === "nome") { nome = String(value).trim(); continue; }
          if (catalog.key === "whatsapp") { phoneRaw = String(value).trim(); continue; }
          if (catalog.key === "consentimento") { consentimento = value === true; continue; }
          if (catalog.key === "email") { email = String(value).trim(); continue; }

          if (catalog.responseType === "address_block" && isAddressAnswer(value)) {
            if (value.cep) contactPayload.cep = value.cep;
            if (value.endereco) contactPayload.endereco = value.endereco;
            if (value.numero) contactPayload.numero = value.numero;
            if (value.complemento) contactPayload.complemento = value.complemento;
            if (value.bairro) contactPayload.bairro = value.bairro;
            if (value.referencia) contactPayload.referencia = value.referencia;
            if (value.cidade) contactPayload.cidade = value.cidade;
            if (value.uf) contactPayload.uf = value.uf.toUpperCase();
            continue;
          }

          for (const col of catalog.targetColumns) {
            if (catalog.filterKind === "boolean") contactPayload[col] = value === true;
            else if (catalog.filterKind === "multiselect") contactPayload[col] = Array.isArray(value) ? value : [value];
            else contactPayload[col] = value;
          }
        }

        if (!isSectioned) {
          if (!nome || nome.length < 2) {
            return new Response(JSON.stringify({ ok: false, error: "Nome ausente." }), { status: 400, headers: cors });
          }
          if (!phoneRaw) {
            return new Response(JSON.stringify({ ok: false, error: "WhatsApp ausente." }), { status: 400, headers: cors });
          }
          if (!consentimento) {
            return new Response(JSON.stringify({ ok: false, error: "É preciso autorizar o contato por WhatsApp." }), { status: 400, headers: cors });
          }
        } else {
          const onPath = (q: QuestionRow) =>
            !sectionPathIds || (q.section_id != null && sectionPathIds.has(q.section_id));
          const hasNomeField = ((questions ?? []) as QuestionRow[]).some((q) => q.catalog_field_key === "nome" && onPath(q));
          const hasPhoneField = ((questions ?? []) as QuestionRow[]).some((q) => q.catalog_field_key === "whatsapp" && onPath(q));
          if (hasNomeField && (!nome || nome.length < 2)) {
            return new Response(JSON.stringify({ ok: false, error: "Nome ausente." }), { status: 400, headers: cors });
          }
          if (hasPhoneField && !phoneRaw) {
            return new Response(JSON.stringify({ ok: false, error: "WhatsApp ausente." }), { status: 400, headers: cors });
          }
          // Não aplicamos fallback aqui: se a seção atual não perguntou "nome",
          // deixamos `nome` como null e decidimos abaixo (insert usa "Participante"
          // pra satisfazer NOT NULL; update omite a chave pra preservar o nome real).

        }
        for (const q of (questions ?? []) as QuestionRow[]) {
          if (sectionPathIds && (!q.section_id || !sectionPathIds.has(q.section_id))) continue;
          if (!q.required || q.source !== "catalog" || !q.catalog_field_key) continue;
          if (!isLegalConsentCatalogKey(q.catalog_field_key)) continue;
          const value = answers[q.id];
          if (value !== true) {
            return new Response(JSON.stringify({ ok: false, error: `É preciso aceitar: ${q.label}` }), { status: 400, headers: cors });
          }
        }

        const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: phoneRaw ?? "" });
        const phoneE164 = phoneRaw ? (norm as string | null) : null;
        if (phoneRaw && !phoneE164) {
          return new Response(JSON.stringify({ ok: false, error: "Telefone inválido" }), { status: 400, headers: cors });
        }

        // Resolução de contato, mesma prioridade de /recadastro: recad_token → telefone → e-mail.
        type TargetRow = {
          id: string;
          phone_e164: string | null;
          opt_out_at: string | null;
          arquivado_at: string | null;
          lifecycle_status: string | null;
        };
        const TARGET_COLS = "id,phone_e164,opt_out_at,arquivado_at,lifecycle_status";
        let target: TargetRow | null = null;
        if (d.recad_token) {
          const { data } = await supabaseAdmin.from("contacts").select(TARGET_COLS).eq("recad_token", d.recad_token).maybeSingle();
          if (data) target = data as TargetRow;
        }
        if (!target && phoneE164) {
          const { data } = await supabaseAdmin.from("contacts").select(TARGET_COLS).eq("phone_e164", phoneE164).maybeSingle();
          if (data) target = data as TargetRow;
        }
        if (!target && email) {
          const { data } = await supabaseAdmin.from("contacts").select(TARGET_COLS).eq("email", email).maybeSingle();
          if (data) target = data as TargetRow;
        }

        // contacts.origem é enum (recadastro|inscricao|import|manual) — reaproveita os
        // mesmos valores que recadastro.ts/inscrever.ts sempre usaram, mapeados pelo
        // tipo do formulário (não existe valor de enum genérico "formulario_publico").
        const origemValue = form.source_form_type === "cadastro_completo" ? "recadastro" as const : "inscricao" as const;
        const hasNome = !!(nome && nome.length >= 2);
        const basePayload = {
          ...contactPayload,
          ...(phoneRaw ? { phone_raw: phoneRaw } : {}),
          ...(email ? { email } : {}),
          ...(form.source_form_type === "receber_informacoes" ? { tipo_contato: "lista_divulgacao" } : {}),
          ...(consentimento ? {
            consentimento_whatsapp: true,
            consentimento_at: new Date().toISOString(),
          } : {}),
          origem: origemValue,
          origem_detalhe: form.title,
          lifecycle_status: "recadastro_concluido" as const,
        };
        // INSERT precisa satisfazer contacts.nome NOT NULL — usa fallback só aqui.
        const insertPayload = { ...basePayload, nome: hasNome ? (nome as string) : "Participante" };
        // Estados de bloqueio pertencem ao sistema, não ao formulário público:
        //  - opt-out só é revertido com consentimento explícito nesta submissão;
        //  - arquivado / "não enviar" NÃO são desfeitos aqui — o contato vai para
        //    revisão manual, mas todos os dados enviados continuam sendo gravados.
        const blocked = !!(target?.arquivado_at || target?.lifecycle_status === "nao_enviar");
        const stateOverrides = {
          ...(target?.opt_out_at && consentimento ? { opt_out_at: null } : {}),
          ...(blocked ? { lifecycle_status: "precisa_revisao" as const } : {}),
        };
        // UPDATE só grava `nome` se a seção atual perguntou de fato — caso contrário
        // preserva o valor já salvo (não sobrescreve "Maria Silva" com "Participante").
        const updatePayload = {
          ...basePayload,
          ...(hasNome ? { nome: nome as string } : {}),
          ...stateOverrides,
        };

        let savedId: string | null = null;
        if (target) {
          if (target.phone_e164 && target.phone_e164 !== phoneE164) {
            // Telefone diferente do já cadastrado: não sobrescreve — cria um novo
            // contato e marca como duplicata provável pra revisão manual.
            const { data: newRow } = await supabaseAdmin.from("contacts").insert(insertPayload).select("id").single();
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
            await supabaseAdmin.from("contacts").update(updatePayload).eq("id", target.id);
            savedId = target.id;
          }
        } else {
          const { data: ins } = await supabaseAdmin.from("contacts").insert(insertPayload).select("id").single();
          savedId = ins?.id ?? null;
        }

        if (!savedId) {
          return new Response(JSON.stringify({ ok: false, error: "Falha ao salvar contato." }), { status: 500, headers: cors });
        }

        if (customAnswers.length) {
          await supabaseAdmin.from("form_custom_answers").insert(
            customAnswers.map((a) => ({
              contact_id: savedId,
              form_definition_id: form.id,
              question_id: a.question_id,
              question_label: a.question_label,
              answer_text: a.answer_text,
            })),
          );
        }

        // Registrar origem/captação (Entrada de Dados = Sistema, canal formulário público).
        const eventType = form.source_form_type === "cadastro_completo" ? "cadastro_completo" : "inscricao_simples";
        try {
          let linkId: string | null = null;
          let trackingLabel = ((form as { tracking_name?: string | null }).tracking_name || form.title).trim();

          const resolveLink = async (token: string) => {
            const { data: row } = await supabaseAdmin
              .from("tracked_form_links")
              .select("id, label, is_active, expires_at")
              .eq("token", token)
              .maybeSingle();
            if (!row?.is_active) return null;
            if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
            return row;
          };

          if (d.ref_token) {
            const refLink = await resolveLink(d.ref_token);
            if (refLink) {
              linkId = refLink.id;
              if (refLink.label?.trim()) trackingLabel = refLink.label.trim();
            }
          } else if (form.tracked_form_link_id) {
            const { data: defaultLink } = await supabaseAdmin
              .from("tracked_form_links")
              .select("id, label, is_active, expires_at")
              .eq("id", form.tracked_form_link_id)
              .maybeSingle();
            if (defaultLink?.is_active && !(defaultLink.expires_at && new Date(defaultLink.expires_at).getTime() < Date.now())) {
              linkId = defaultLink.id;
              if (defaultLink.label?.trim()) trackingLabel = defaultLink.label.trim();
            }
          }

          await supabaseAdmin.rpc("apply_contact_source", {
            _contact_id: savedId,
            _source_user_id: null as unknown as string,
            _source_module: "formulario_publico",
            _source_form_type: form.source_form_type,
            _source_link_id: linkId as unknown as string,
            _event_type: eventType,
            _metadata: buildSourceMetadata({
              capture_channel: "formulario_publico",
              tracking_label: trackingLabel,
              form_definition_id: form.id,
              via: "form_builder",
            }),
          });
        } catch { /* ignore */ }

        // Geocodifica se algum campo de endereço foi incluído no formulário.
        if (contactPayload.cidade || contactPayload.cep) {
          try {
            const { geocodeAddress } = await import("@/lib/cep.server");
            const g = await geocodeAddress({
              endereco: contactPayload.endereco as string | undefined,
              numero: contactPayload.numero as string | undefined,
              bairro: contactPayload.bairro as string | undefined,
              cidade: contactPayload.cidade as string | undefined,
              uf: contactPayload.uf as string | undefined,
              cep: contactPayload.cep as string | undefined,
            });
            if (g && g.status !== "erro") {
              await supabaseAdmin.from("contacts").update({
                latitude: g.latitude, longitude: g.longitude,
                geocoding_provider: g.provider,
                geocoding_status: g.status === "aproximado" ? "aproximado" : "localizado",
                geocoded_at: new Date().toISOString(),
              }).eq("id", savedId);
            }
          } catch { /* non-blocking */ }
        }

        // Confirmação e botão de WhatsApp são independentes (a automação dispara de
        // forma assíncrona/não bloqueante de qualquer jeito) — isso só informa a tela
        // de sucesso se a automação de confirmação está ligada, pra decidir o texto e
        // a ordem dos dois blocos, sem criar nenhuma dependência técnica entre eles.
        let confirmationEnabled = false;
        try {
          const { data: auto } = await supabaseAdmin
            .from("automations")
            .select("active")
            .eq("event_key", form.event_key)
            .maybeSingle();
          const formConfirmation = Boolean(auto?.active);
          confirmationEnabled = terminalSection?.confirmation_active != null
            ? Boolean(terminalSection.confirmation_active)
            : formConfirmation;
        } catch { /* ignore */ }

        const waEnabled = terminalSection?.whatsapp_button_enabled != null
          ? Boolean(terminalSection.whatsapp_button_enabled)
          : form.whatsapp_button_enabled;
        const waMessage = terminalSection?.whatsapp_button_message ?? form.whatsapp_button_message;
        const waPhone = terminalSection?.whatsapp_button_phone?.trim() || form.whatsapp_button_phone;
        const successOrder = terminalSection?.success_screen_order ?? form.success_screen_order;
        const pushEnabled = terminalSection?.push_button_enabled != null
          ? Boolean(terminalSection.push_button_enabled)
          : Boolean((form as { push_button_enabled?: boolean }).push_button_enabled);

        let linkedEvent: { slug: string; title: string } | null = null;
        if (terminalSection?.linked_event_id) {
          const { data: ev } = await supabaseAdmin
            .from("events")
            .select("slug,title,is_published")
            .eq("id", terminalSection.linked_event_id)
            .maybeSingle();
          if (ev?.is_published) {
            linkedEvent = { slug: ev.slug, title: ev.title };
          }
        }

        let contactRecadToken: string | null = null;
        try {
          const { data: cToken } = await supabaseAdmin
            .from("contacts")
            .select("recad_token")
            .eq("id", savedId)
            .maybeSingle();
          contactRecadToken = cToken?.recad_token ?? null;
        } catch { /* ignore */ }

        // Presença no evento gravada na mesma submissão, quando o formulário
        // foi aberto a partir da tela pública de um evento.
        let eventConfirmed = false;
        if (d.event_slug) {
          try {
            const { confirmEventRsvpForContact } = await import("@/lib/events-public.server");
            const rsvp = await confirmEventRsvpForContact({ eventSlug: d.event_slug, contactId: savedId });
            eventConfirmed = rsvp.ok;
          } catch { /* non-blocking */ }
        }



        try {
          const origin = request.headers.get("origin") ||
            (request.headers.get("host") ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host")}` : null);
          const { data: c } = await supabaseAdmin.from("contacts")
            .select("id,nome,nome_social,phone_e164,cidade,bairro,recad_token,consentimento_whatsapp,opt_out_at,arquivado_at")
            .eq("id", savedId).single();
          if (c) {
            const { triggerAutomationsForEvent } = await import("@/lib/automations.server");
            await triggerAutomationsForEvent({ eventKey: form.event_key, contact: c, origin });
          }
        } catch { /* ignore */ }

        return new Response(
          JSON.stringify({
            ok: true,
            nome: nome ?? "Participante",
            whatsapp_button: waEnabled
              ? { phone: waPhone, message: waMessage }
              : null,
            confirmation_enabled: confirmationEnabled,
            success_screen_order: successOrder,
            push_button_enabled: pushEnabled,
            contact_id: savedId,
            contact_recad_token: contactRecadToken,
            linked_event: linkedEvent,
            event_confirmed: eventConfirmed,

          }),
          { headers: cors },
        );
      },
    },
  },
});
