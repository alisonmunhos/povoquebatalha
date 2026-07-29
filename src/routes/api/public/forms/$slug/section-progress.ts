import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";
import { saveFormContactFromAnswers } from "@/lib/public-form-contact.server";

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

const bodySchema = z.object({
  ref_token: z.string().trim().min(8).max(48).optional().or(z.literal("")),
  recad_token: z.string().uuid().optional().or(z.literal("")),
  current_section_id: z.string().uuid(),
  /** Quando o formulário é aberto pela tela de um evento: registra presença junto. */
  event_slug: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  event_rsvp_status: z.enum(["confirmed", "declined"]).optional(),
  answers: z.record(
    z.string().uuid(),
    z.union([z.string(), z.array(z.string()), z.boolean(), z.null(), addressBlockSchema]),
  ),
  ...honeypotSchema,
});


export const Route = createFileRoute("/api/public/forms/$slug/section-progress")({
  server: {
    handlers: {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),

      POST: async ({ request, params }) => {
        const ip = getRequestIp(request);
        if (isRateLimited(`form-progress:${params.slug}:${ip}`)) {
          return new Response(JSON.stringify({ ok: false, error: "Muitas tentativas." }), { status: 429, headers: cors });
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: form } = await supabaseAdmin
          .from("form_definitions")
          .select("id,title,source_form_type,tracking_name,tracked_form_link_id,is_active,layout_mode")
          .eq("slug", params.slug)
          .eq("is_active", true)
          .maybeSingle();
        if (!form || form.layout_mode !== "sectioned") {
          return new Response(JSON.stringify({ ok: false, error: "Formulário não encontrado." }), { status: 404, headers: cors });
        }

        const { data: section } = await supabaseAdmin
          .from("form_sections")
          .select("id,section_type")
          .eq("id", d.current_section_id)
          .eq("form_definition_id", form.id)
          .maybeSingle();
        if (!section || section.section_type === "account_creation") {
          return new Response(JSON.stringify({ ok: false, error: "Seção inválida." }), { status: 400, headers: cors });
        }

        const { data: questions } = await supabaseAdmin
          .from("form_definition_questions")
          .select("id,order_index,source,catalog_field_key,label,help_text,required,section_id,custom_response_type,custom_options")
          .eq("form_definition_id", form.id)
          .order("order_index", { ascending: true });

        const result = await saveFormContactFromAnswers({
          form,
          questions: (questions ?? []) as Parameters<typeof saveFormContactFromAnswers>[0]["questions"],
          answers: d.answers,
          recad_token: d.recad_token || undefined,
          ref_token: d.ref_token || undefined,
          validateSectionIds: [d.current_section_id],
          finalize: false,
        });

        if ("ok" in result && result.ok === false) {
          return new Response(JSON.stringify({ ok: false, error: result.error }), { status: result.status, headers: cors });
        }

        const saved = result as Exclude<typeof result, { ok: false }>;

        // Presença no evento é gravada na mesma operação do salvamento do contato.
        let eventConfirmed = false;
        if (d.event_slug) {
          const { confirmEventRsvpForContact } = await import("@/lib/events-public.server");
          const rsvp = await confirmEventRsvpForContact({ eventSlug: d.event_slug, contactId: saved.contactId });
          eventConfirmed = rsvp.ok;
        }

        // A pessoa já tem conta no sistema? (evita pedir criação de senha de novo)
        let hasAccount = false;
        {
          const { data: c } = await supabaseAdmin
            .from("contacts")
            .select("is_system_user")
            .eq("id", saved.contactId)
            .maybeSingle();
          hasAccount = Boolean(c?.is_system_user);
          if (!hasAccount) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("contact_id", saved.contactId)
              .maybeSingle();
            hasAccount = Boolean(prof);
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            recad_token: saved.recad_token,
            email: saved.email,
            nome: saved.nome,
            phone: saved.phone,
            has_account: hasAccount,
            event_confirmed: eventConfirmed,
          }),
          { headers: cors },
        );

      },
    },
  },
});
