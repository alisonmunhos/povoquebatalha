import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getRequestIp, honeypotSchema, isHoneypotTripped, isRateLimited } from "@/lib/public-form-guards.server";
import { isEmailAlreadyRegistered, saveFormContactFromAnswers } from "@/lib/public-form-contact.server";
import { createPendingUserFromSignup } from "@/lib/public-user-signup.server";
import type { AppRole } from "@/lib/roles";

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
  recad_token: z.string().uuid(),
  section_id: z.string().uuid(),
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(120)
    .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use pelo menos uma letra e um número."),
  password_confirm: z.string().min(1),
  ref_token: z.string().trim().min(8).max(48).optional().or(z.literal("")),
  answers: z
    .record(
      z.string().uuid(),
      z.union([z.string(), z.array(z.string()), z.boolean(), z.null(), addressBlockSchema]),
    )
    .optional(),
  ...honeypotSchema,
});

export const Route = createFileRoute("/api/public/forms/$slug/account-section")({
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
        if (isRateLimited(`form-account:${params.slug}:${ip}`)) {
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

        if (d.password !== d.password_confirm) {
          return new Response(JSON.stringify({ ok: false, error: "As senhas não coincidem." }), { status: 400, headers: cors });
        }

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
          .select("id,section_type,account_creation_role")
          .eq("id", d.section_id)
          .eq("form_definition_id", form.id)
          .maybeSingle();
        if (!section || section.section_type !== "account_creation") {
          return new Response(JSON.stringify({ ok: false, error: "Seção inválida." }), { status: 400, headers: cors });
        }

        // Salva respostas desta seção (se houver) antes de criar a conta.
        // Reaproveita o mesmo caminho do section-progress para manter consistência.
        let activeRecadToken = d.recad_token;
        if (d.answers && Object.keys(d.answers).length > 0) {
          const { data: questions } = await supabaseAdmin
            .from("form_definition_questions")
            .select("id,order_index,source,catalog_field_key,label,help_text,required,section_id,custom_response_type,custom_options")
            .eq("form_definition_id", form.id)
            .order("order_index", { ascending: true });

          const saveResult = await saveFormContactFromAnswers({
            form,
            questions: (questions ?? []) as Parameters<typeof saveFormContactFromAnswers>[0]["questions"],
            answers: d.answers,
            recad_token: d.recad_token,
            ref_token: d.ref_token || undefined,
            validateSectionIds: [d.section_id],
            finalize: false,
          });

          if ("ok" in saveResult && saveResult.ok === false) {
            return new Response(
              JSON.stringify({ ok: false, error: saveResult.error }),
              { status: saveResult.status, headers: cors },
            );
          }
          const saved = saveResult as Exclude<typeof saveResult, { ok: false }>;
          if (saved.recad_token) activeRecadToken = saved.recad_token;
        }

        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id,nome,email,phone_raw,phone_e164")
          .eq("recad_token", activeRecadToken)
          .maybeSingle();
        if (!contact?.email?.trim()) {
          return new Response(
            JSON.stringify({ ok: false, error: "E-mail não encontrado no cadastro. Volte e preencha o e-mail nas etapas anteriores." }),
            { status: 400, headers: cors },
          );
        }

        const email = contact.email.trim().toLowerCase();
        if (await isEmailAlreadyRegistered(email)) {
          return new Response(
            JSON.stringify({
              ok: false,
              code: "email_already_registered",
              error: "Este e-mail já está cadastrado. Se você já tem conta, faça login normalmente.",
            }),
            { status: 409, headers: cors },
          );
        }

        const phone = contact.phone_raw?.trim() || contact.phone_e164 || "";
        if (!phone) {
          return new Response(
            JSON.stringify({ ok: false, error: "WhatsApp não encontrado no cadastro. Volte e preencha nas etapas anteriores." }),
            { status: 400, headers: cors },
          );
        }

        const requestedRole = (section.account_creation_role ?? "agitador") as AppRole;
        const result = await createPendingUserFromSignup({
          nome: contact.nome?.trim() || "Participante",
          phone,
          email,
          password: d.password,
          requestedRole,
          via: "form_section_account_creation",
          sendWelcomeWhatsApp: false,
          request,
        });

        if (!result.ok) {
          if (result.code === "email_already_registered") {
            return new Response(
              JSON.stringify({ ok: false, code: result.code, error: result.error }),
              { status: 409, headers: cors },
            );
          }
          return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 400, headers: cors });
        }

        return new Response(JSON.stringify({ ok: true, recad_token: activeRecadToken }), { headers: cors });
      },
    },
  },
});
