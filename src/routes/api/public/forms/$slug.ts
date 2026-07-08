// Handler genérico para qualquer formulário criado no construtor ("Entrada de Dados").
// GET  /api/public/forms/$slug  → definição pública do formulário (perguntas ordenadas).
// POST /api/public/forms/$slug  → submissão: upsert de contato + apply_contact_source +
//                                  automação de confirmação, no mesmo padrão de
//                                  /api/public/forms/{inscrever,recadastro}.ts.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCatalogField } from "@/lib/form-field-catalog";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";

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
};

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

      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("form_definitions")
          .select("id,title,is_active,whatsapp_button_enabled")
          .eq("slug", params.slug)
          .eq("is_active", true)
          .maybeSingle();
        if (!form) {
          return new Response(JSON.stringify({ ok: false, error: "Formulário não encontrado." }), { status: 404, headers: cors });
        }
        const { data: questions } = await supabaseAdmin
          .from("form_definition_questions")
          .select("id,order_index,source,catalog_field_key,label,help_text,required")
          .eq("form_definition_id", form.id)
          .order("order_index", { ascending: true });

        const enriched = ((questions ?? []) as QuestionRow[]).map((q) => {
          const catalog = q.source === "catalog" && q.catalog_field_key ? getCatalogField(q.catalog_field_key) : undefined;
          return {
            id: q.id,
            label: q.label,
            help_text: q.help_text,
            required: q.required,
            response_type: catalog?.responseType ?? "short_text",
            filter_kind: catalog?.filterKind ?? "text",
            options: catalog?.options ?? null,
            depends_on: catalog?.dependsOn ?? null,
            catalog_field_key: q.catalog_field_key,
          };
        });

        return new Response(
          JSON.stringify({
            ok: true,
            form: { id: form.id, title: form.title, whatsapp_button_enabled: form.whatsapp_button_enabled, questions: enriched },
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

        const { data: form } = await supabaseAdmin
          .from("form_definitions")
          .select("id,slug,title,is_active,source_form_type,event_key,tracked_form_link_id,whatsapp_button_enabled,whatsapp_button_message,whatsapp_button_phone,success_screen_order")
          .eq("slug", params.slug)
          .eq("is_active", true)
          .maybeSingle();
        if (!form) {
          return new Response(JSON.stringify({ ok: false, error: "Formulário não encontrado." }), { status: 404, headers: cors });
        }
        const { data: questions } = await supabaseAdmin
          .from("form_definition_questions")
          .select("id,order_index,source,catalog_field_key,label,help_text,required")
          .eq("form_definition_id", form.id)
          .order("order_index", { ascending: true });

        type AddressAnswer = { cep?: string; endereco?: string; numero?: string; complemento?: string; bairro?: string; referencia?: string; cidade?: string; uf?: string };
        const answers = d.answers as Record<string, string | string[] | boolean | AddressAnswer | null>;
        const isAddressAnswer = (v: unknown): v is AddressAnswer =>
          typeof v === "object" && v !== null && !Array.isArray(v);

        // Valida obrigatoriedade e localiza nome/telefone (sempre presentes no catálogo core).
        let nome: string | null = null;
        let phoneRaw: string | null = null;
        let email: string | null = null;
        let consentimento = false;
        const contactPayload: Record<string, unknown> = {};
        const customAnswers: { question_id: string; question_label: string; answer_text: string }[] = [];

        for (const q of (questions ?? []) as QuestionRow[]) {
          const value = answers[q.id];
          const isEmpty =
            value == null || value === "" ||
            (Array.isArray(value) && value.length === 0) ||
            (isAddressAnswer(value) && !Object.values(value).some((v) => v && String(v).trim()));
          if (q.required && isEmpty) {
            return new Response(JSON.stringify({ ok: false, error: `Campo obrigatório: ${q.label}` }), { status: 400, headers: cors });
          }
          if (isEmpty) continue;

          if (q.source === "custom") {
            customAnswers.push({ question_id: q.id, question_label: q.label, answer_text: String(value) });
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

        if (!nome || nome.length < 2) {
          return new Response(JSON.stringify({ ok: false, error: "Nome ausente." }), { status: 400, headers: cors });
        }
        if (!phoneRaw) {
          return new Response(JSON.stringify({ ok: false, error: "WhatsApp ausente." }), { status: 400, headers: cors });
        }
        if (!consentimento) {
          return new Response(JSON.stringify({ ok: false, error: "É preciso autorizar o contato por WhatsApp." }), { status: 400, headers: cors });
        }

        const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: phoneRaw });
        const phoneE164 = norm as string | null;
        if (!phoneE164) {
          return new Response(JSON.stringify({ ok: false, error: "Telefone inválido" }), { status: 400, headers: cors });
        }

        // Resolução de contato, mesma prioridade de /recadastro: recad_token → telefone → e-mail.
        let target: { id: string; phone_e164: string | null } | null = null;
        if (d.recad_token) {
          const { data } = await supabaseAdmin.from("contacts").select("id,phone_e164").eq("recad_token", d.recad_token).maybeSingle();
          if (data) target = data;
        }
        if (!target) {
          const { data } = await supabaseAdmin.from("contacts").select("id,phone_e164").eq("phone_e164", phoneE164).maybeSingle();
          if (data) target = data;
        }
        if (!target && email) {
          const { data } = await supabaseAdmin.from("contacts").select("id,phone_e164").eq("email", email).maybeSingle();
          if (data) target = data;
        }

        // contacts.origem é enum (recadastro|inscricao|import|manual) — reaproveita os
        // mesmos valores que recadastro.ts/inscrever.ts sempre usaram, mapeados pelo
        // tipo do formulário (não existe valor de enum genérico "formulario_publico").
        const origemValue = form.source_form_type === "cadastro_completo" ? "recadastro" as const : "inscricao" as const;
        const payload = {
          ...contactPayload,
          nome,
          phone_raw: phoneRaw,
          ...(email ? { email } : {}),
          // Paridade com inscrever.ts: formulários de "receber informações" marcam o
          // contato como lista de divulgação (recadastro.ts não seta tipo_contato).
          ...(form.source_form_type === "receber_informacoes" ? { tipo_contato: "lista_divulgacao" } : {}),
          consentimento_whatsapp: true,
          consentimento_at: new Date().toISOString(),
          origem: origemValue,
          origem_detalhe: form.title,
          lifecycle_status: "recadastro_concluido" as const,
          opt_out_at: null,
        };
        let savedId: string | null = null;
        if (target) {
          if (target.phone_e164 && target.phone_e164 !== phoneE164) {
            // Telefone diferente do já cadastrado: não sobrescreve — cria um novo
            // contato e marca como duplicata provável pra revisão manual.
            const { data: newRow } = await supabaseAdmin.from("contacts").insert(payload).select("id").single();
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
            await supabaseAdmin.from("contacts").update(payload).eq("id", target.id);
            savedId = target.id;
          }
        } else {
          const { data: ins } = await supabaseAdmin.from("contacts").insert(payload).select("id").single();
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

        // Registrar origem/captação: link do próprio formulário (se houver) ou fallback.
        // Tipo de evento reflete o tipo do formulário, no mesmo padrão de inscrever.ts/recadastro.ts.
        const eventType = form.source_form_type === "cadastro_completo" ? "cadastro_completo" : "inscricao_simples";
        try {
          const { data: link } = form.tracked_form_link_id
            ? await supabaseAdmin
                .from("tracked_form_links")
                .select("id, created_by_user_id, source_module, source_form_type, is_active, expires_at")
                .eq("id", form.tracked_form_link_id)
                .maybeSingle()
            : { data: null };
          const linkExpired = link?.expires_at ? new Date(link.expires_at).getTime() < Date.now() : false;
          if (link && link.is_active && !linkExpired) {
            await supabaseAdmin.rpc("apply_contact_source", {
              _contact_id: savedId,
              _source_user_id: link.created_by_user_id,
              _source_module: link.source_module,
              _source_form_type: link.source_form_type,
              _source_link_id: link.id,
              _event_type: eventType,
              _metadata: { via: "form_builder", form_definition_id: form.id, form_slug: form.slug },
            });
          } else {
            await supabaseAdmin.rpc("apply_contact_source", {
              _contact_id: savedId,
              _source_user_id: null as unknown as string,
              _source_module: "formulario_publico",
              _source_form_type: form.source_form_type,
              _source_link_id: null as unknown as string,
              _event_type: eventType,
              _metadata: { via: "form_builder_sem_link", form_definition_id: form.id, form_slug: form.slug },
            });
          }
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
          confirmationEnabled = Boolean(auto?.active);
        } catch { /* ignore */ }

        try {
          const origin = request.headers.get("origin") ||
            (request.headers.get("host") ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host")}` : null);
          const { data: c } = await supabaseAdmin.from("contacts")
            .select("id,nome,phone_e164,cidade,bairro,recad_token,consentimento_whatsapp,opt_out_at,arquivado_at")
            .eq("id", savedId).single();
          if (c) {
            const { triggerAutomationsForEvent } = await import("@/lib/automations.server");
            await triggerAutomationsForEvent({ eventKey: form.event_key, contact: c, origin });
          }
        } catch { /* ignore */ }

        return new Response(
          JSON.stringify({
            ok: true,
            nome,
            whatsapp_button: form.whatsapp_button_enabled
              ? { phone: form.whatsapp_button_phone, message: form.whatsapp_button_message }
              : null,
            confirmation_enabled: confirmationEnabled,
            success_screen_order: form.success_screen_order,
          }),
          { headers: cors },
        );
      },
    },
  },
});
