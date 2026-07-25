// Salva/atualiza contato a partir de respostas de formulário público — compartilhado
// entre o POST final ($slug) e o save parcial entre seções (section-progress).
import { buildSourceMetadata } from "@/lib/contact-source-metadata";
import { getCatalogField } from "@/lib/form-field-catalog";
import {
  getEffectiveQuestionShape,
  labelForCustomOptionValue,
  type CustomOption,
} from "@/lib/form-question-shape";
import { isLegalConsentCatalogKey } from "@/lib/legal-consent-fields";

export type FormQuestionRow = {
  id: string;
  order_index: number;
  source: "catalog" | "custom";
  catalog_field_key: string | null;
  label: string;
  help_text: string | null;
  required: boolean;
  section_id: string | null;
  custom_response_type: string | null;
  custom_options: CustomOption[] | null;
};

type AddressAnswer = {
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  referencia?: string;
  cidade?: string;
  uf?: string;
};

type AnswerValue = string | string[] | boolean | AddressAnswer | null;

function isAddressAnswer(v: unknown): v is AddressAnswer {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isEmptyAnswer(value: unknown): boolean {
  return (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (isAddressAnswer(value) && !Object.values(value).some((v) => v && String(v).trim()))
  );
}

export type SaveFormContactInput = {
  form: {
    id: string;
    title: string;
    source_form_type: string;
    tracking_name?: string | null;
    tracked_form_link_id?: string | null;
  };
  questions: FormQuestionRow[];
  answers: Record<string, AnswerValue>;
  recad_token?: string;
  ref_token?: string;
  /** Se informado, valida obrigatórios só das perguntas dessas seções. */
  validateSectionIds?: string[];
  /** Quando false, não dispara automações nem marca recadastro como concluído. */
  finalize?: boolean;
};

export type SaveFormContactResult = {
  contactId: string;
  recad_token: string;
  nome: string | null;
  email: string | null;
};

export type SaveFormContactError = { ok: false; status: number; error: string };

export async function saveFormContactFromAnswers(
  input: SaveFormContactInput,
): Promise<SaveFormContactResult | SaveFormContactError> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { form, questions, answers, recad_token, ref_token, validateSectionIds, finalize = true } = input;

  const shouldValidateQuestion = (q: FormQuestionRow) => {
    if (!validateSectionIds?.length) return true;
    return q.section_id != null && validateSectionIds.includes(q.section_id);
  };

  let nome: string | null = null;
  let phoneRaw: string | null = null;
  let email: string | null = null;
  let consentimento = false;
  const contactPayload: Record<string, unknown> = {};
  const customAnswers: { question_id: string; question_label: string; answer_text: string }[] = [];

  for (const q of questions) {
    const value = answers[q.id];
    const isEmpty = isEmptyAnswer(value);
    if (q.required && shouldValidateQuestion(q) && isEmpty) {
      return { ok: false, status: 400, error: `Campo obrigatório: ${q.label}` };
    }
    if (isEmpty) continue;

    if (q.source === "custom") {
      const shape = getEffectiveQuestionShape(q);
      let answerText = String(value);
      if (shape.response_type === "multiple_choice") {
        if (typeof value !== "string" || !value.trim()) {
          if (q.required && shouldValidateQuestion(q)) {
            return { ok: false, status: 400, error: `Campo obrigatório: ${q.label}` };
          }
          continue;
        }
        const allowed = (q.custom_options ?? []).some((o) => o.value === value);
        if (!allowed) {
          return { ok: false, status: 400, error: `Resposta inválida: ${q.label}` };
        }
        answerText = labelForCustomOptionValue(q.custom_options, value);
      }
      customAnswers.push({ question_id: q.id, question_label: q.label, answer_text: answerText });
      continue;
    }

    const catalog = q.catalog_field_key ? getCatalogField(q.catalog_field_key) : undefined;
    if (!catalog) continue;

    if (catalog.key === "nome") {
      nome = String(value).trim();
      continue;
    }
    if (catalog.key === "whatsapp") {
      phoneRaw = String(value).trim();
      continue;
    }
    if (catalog.key === "consentimento") {
      consentimento = value === true;
      continue;
    }
    if (catalog.key === "email") {
      email = String(value).trim();
      continue;
    }

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

  for (const q of questions) {
    if (!shouldValidateQuestion(q) || !q.required || q.source !== "catalog" || !q.catalog_field_key) continue;
    if (!isLegalConsentCatalogKey(q.catalog_field_key)) continue;
    if (answers[q.id] !== true) {
      return { ok: false, status: 400, error: `É preciso aceitar: ${q.label}` };
    }
  }

  const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: phoneRaw ?? "" });
  const phoneE164 = phoneRaw ? (norm as string | null) : null;
  if (phoneRaw && !phoneE164) {
    return { ok: false, status: 400, error: "Telefone inválido" };
  }

  let target: { id: string; phone_e164: string | null; recad_token: string | null } | null = null;
  if (recad_token) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id,phone_e164,recad_token")
      .eq("recad_token", recad_token)
      .maybeSingle();
    if (data) target = data;
  }
  if (!target && phoneE164) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id,phone_e164,recad_token")
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    if (data) target = data;
  }
  if (!target && email) {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("id,phone_e164,recad_token")
      .eq("email", email)
      .maybeSingle();
    if (data) target = data;
  }

  const origemValue = form.source_form_type === "cadastro_completo" ? ("recadastro" as const) : ("inscricao" as const);
  const hasNome = !!(nome && nome.length >= 2);
  const basePayload = {
    ...contactPayload,
    ...(phoneRaw ? { phone_raw: phoneRaw } : {}),
    ...(email ? { email } : {}),
    ...(form.source_form_type === "receber_informacoes" ? { tipo_contato: "lista_divulgacao" } : {}),
    ...(consentimento
      ? {
          consentimento_whatsapp: true,
          consentimento_at: new Date().toISOString(),
        }
      : {}),
    origem: origemValue,
    origem_detalhe: form.title,
    ...(finalize ? { lifecycle_status: "recadastro_concluido" as const, opt_out_at: null } : {}),
  };
  const insertPayload = { ...basePayload, nome: hasNome ? (nome as string) : "Participante" };
  const updatePayload = hasNome ? { ...basePayload, nome: nome as string } : basePayload;

  let savedId: string | null = null;
  if (target) {
    if (target.phone_e164 && phoneE164 && target.phone_e164 !== phoneE164) {
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
    return { ok: false, status: 500, error: "Falha ao salvar contato." };
  }

  if (customAnswers.length) {
    await supabaseAdmin.from("form_custom_answers").delete().eq("contact_id", savedId).eq("form_definition_id", form.id);
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

  if (finalize) {
    const eventType = form.source_form_type === "cadastro_completo" ? "cadastro_completo" : "inscricao_simples";
    try {
      let linkId: string | null = null;
      let trackingLabel = ((form.tracking_name ?? "") || form.title).trim();

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

      if (ref_token) {
        const refLink = await resolveLink(ref_token);
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
        if (
          defaultLink?.is_active &&
          !(defaultLink.expires_at && new Date(defaultLink.expires_at).getTime() < Date.now())
        ) {
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
    } catch {
      /* ignore */
    }
  }

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
        await supabaseAdmin
          .from("contacts")
          .update({
            latitude: g.latitude,
            longitude: g.longitude,
            geocoding_provider: g.provider,
            geocoding_status: g.status === "aproximado" ? "aproximado" : "localizado",
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", savedId);
      }
    } catch {
      /* non-blocking */
    }
  }

  const { data: savedContact } = await supabaseAdmin
    .from("contacts")
    .select("recad_token,nome,email")
    .eq("id", savedId)
    .single();

  return {
    contactId: savedId,
    recad_token: savedContact?.recad_token ?? recad_token ?? "",
    nome: savedContact?.nome ?? nome,
    email: savedContact?.email ?? email,
  };
}

export async function isEmailAlreadyRegistered(email: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return (existing?.users ?? []).some((u: { email?: string | null }) => (u.email ?? "").toLowerCase() === normalized);
}
