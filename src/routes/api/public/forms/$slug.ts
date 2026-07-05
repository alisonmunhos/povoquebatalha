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

const submitSchema = z.object({
  ref_token: z.string().trim().min(8).max(48).optional().or(z.literal("")),
  answers: z.record(z.string().uuid(), z.union([z.string(), z.array(z.string()), z.boolean(), z.null()])),
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
          .select("id,slug,title,is_active,source_form_type,event_key,tracked_form_link_id,whatsapp_button_enabled,whatsapp_button_message")
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

        const answers = d.answers as Record<string, string | string[] | boolean | null>;

        // Valida obrigatoriedade e localiza nome/telefone (sempre presentes no catálogo core).
        let nome: string | null = null;
        let phoneRaw: string | null = null;
        let consentimento = false;
        const contactPayload: Record<string, unknown> = {};
        const customAnswers: { question_id: string; question_label: string; answer_text: string }[] = [];

        for (const q of (questions ?? []) as QuestionRow[]) {
          const value = answers[q.id];
          const isEmpty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
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

        const { data: existing } = await supabaseAdmin.from("contacts").select("id").eq("phone_e164", phoneE164).maybeSingle();
        const payload = {
          ...contactPayload,
          nome,
          phone_raw: phoneRaw,
          consentimento_whatsapp: true,
          origem: "manual" as const,
          origem_detalhe: form.title,
          lifecycle_status: "recadastro_concluido" as const,
          opt_out_at: null,
        };
        let savedId: string | null = null;
        if (existing) {
          await supabaseAdmin.from("contacts").update(payload).eq("id", existing.id);
          savedId = existing.id;
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
                geocoding_provider: g.provider, geocoding_status: g.status, geocoded_at: new Date().toISOString(),
              }).eq("id", savedId);
            }
          } catch { /* non-blocking */ }
        }

        let numeroConectado: string | null = null;
        if (form.whatsapp_button_enabled) {
          try {
            const { data: inst } = await supabaseAdmin
              .from("whatsapp_instances")
              .select("numero_conectado")
              .eq("provider", "zapi")
              .maybeSingle();
            numeroConectado = inst?.numero_conectado ?? null;
          } catch { /* ignore */ }
        }

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
              ? { numero_conectado: numeroConectado, message: form.whatsapp_button_message }
              : null,
          }),
          { headers: cors },
        );
      },
    },
  },
});
