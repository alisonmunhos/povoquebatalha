// Rota pública (sem login) do link exclusivo de execução de uma Missão de
// Agitação — o responsável abre /missao/$missionId/contato/$contactId (ver rota
// de página correspondente) e essa página consome este endpoint via fetch
// simples, mesmo padrão de /api/public/forms/$slug.ts. O responsável é
// identificado por contact_id (qualquer contato da base, sem precisar de
// conta no sistema) — não por um id de auth.users.
// GET  → missão + tarefas atribuídas a esse contato (ou aviso de pausa).
// POST → marca uma tarefa (do próprio contato) como concluída ou não enviada.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const markSchema = z.object({
  task_id: z.string().uuid(),
  action: z.enum(["concluido", "nao_enviado"]).default("concluido"),
});

export const Route = createFileRoute("/api/public/agitation-missions/$missionId/$contactId")({
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

        const { data: mission, error } = await supabaseAdmin
          .from("agitation_missions")
          .select("id,title,message_template,paused_at,media_path,media_filename")
          .eq("id", params.missionId)
          .maybeSingle();
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: cors,
          });
        }
        if (!mission) {
          return new Response(JSON.stringify({ ok: false, error: "Missão não encontrada." }), {
            status: 404,
            headers: cors,
          });
        }

        const { data: linkPause } = await supabaseAdmin
          .from("agitation_link_pauses")
          .select("mission_id")
          .eq("mission_id", params.missionId)
          .eq("contact_id", params.contactId)
          .maybeSingle();

        if (mission.paused_at || linkPause) {
          return new Response(
            JSON.stringify({ ok: true, paused: true, mission: { title: mission.title } }),
            {
              headers: cors,
            },
          );
        }

        const { data: tasks, error: e2 } = await supabaseAdmin
          .from("agitation_tasks")
          .select(
            "id,status,assigned_at,contacts!agitation_tasks_contact_id_fkey(nome,nome_social,phone_e164,phone_raw,cidade,bairro,uf,recad_token)",
          )
          .eq("mission_id", params.missionId)
          .eq("assigned_contact_id", params.contactId)
          .order("created_at", { ascending: true });
        if (e2) {
          return new Response(JSON.stringify({ ok: false, error: e2.message }), {
            status: 500,
            headers: cors,
          });
        }

        return new Response(
          JSON.stringify({
            ok: true,
            paused: false,
            mission: {
              id: mission.id,
              title: mission.title,
              message_template: mission.message_template,
              media_url: mission.media_path
                ? `/api/public/agitation-missions/${mission.id}/media`
                : null,
              media_filename: mission.media_filename,
            },
            tasks: (tasks ?? []).map((t) => ({
              id: t.id,
              status: t.status,
              assigned_at: t.assigned_at,
              contact: t.contacts,
            })),
          }),
          { headers: cors },
        );
      },

      POST: async ({ request, params }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), {
            status: 400,
            headers: cors,
          });
        }
        const parsed = markSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: parsed.error.issues[0]?.message ?? "Dados inválidos",
            }),
            { status: 400, headers: cors },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: task, error } = await supabaseAdmin
          .from("agitation_tasks")
          .select("id,mission_id,assigned_contact_id")
          .eq("id", parsed.data.task_id)
          .maybeSingle();
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: cors,
          });
        }
        if (
          !task ||
          task.mission_id !== params.missionId ||
          task.assigned_contact_id !== params.contactId
        ) {
          return new Response(
            JSON.stringify({ ok: false, error: "Tarefa não encontrada para este responsável." }),
            { status: 404, headers: cors },
          );
        }

        const { error: e2 } = await supabaseAdmin
          .from("agitation_tasks")
          .update({ status: parsed.data.action })
          .eq("id", parsed.data.task_id);
        if (e2) {
          return new Response(JSON.stringify({ ok: false, error: e2.message }), {
            status: 500,
            headers: cors,
          });
        }

        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      },
    },
  },
});
