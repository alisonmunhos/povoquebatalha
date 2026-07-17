// Rota pública (sem login) do link exclusivo de execução de uma Missão de
// Agitação — o responsável abre /missao/$missionId/user/$userId (ver rota de
// página correspondente) e essa página consome este endpoint via fetch simples,
// mesmo padrão de /api/public/forms/$slug.ts.
// GET  → missão + tarefas atribuídas a esse usuário.
// POST → marca uma tarefa (do próprio usuário) como concluída.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const markCompletedSchema = z.object({ task_id: z.string().uuid() });

export const Route = createFileRoute("/api/public/agitation-missions/$missionId/$userId")({
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
          .select("id,title,message_template")
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

        const { data: tasks, error: e2 } = await supabaseAdmin
          .from("agitation_tasks")
          .select(
            "id,status,contacts(nome,nome_social,phone_e164,phone_raw,cidade,bairro,uf,recad_token)",
          )
          .eq("mission_id", params.missionId)
          .eq("assigned_user_id", params.userId)
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
            mission,
            tasks: (tasks ?? []).map((t) => ({ id: t.id, status: t.status, contact: t.contacts })),
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
        const parsed = markCompletedSchema.safeParse(body);
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
          .select("id,mission_id,assigned_user_id")
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
          task.assigned_user_id !== params.userId
        ) {
          return new Response(
            JSON.stringify({ ok: false, error: "Tarefa não encontrada para este responsável." }),
            { status: 404, headers: cors },
          );
        }

        const { error: e2 } = await supabaseAdmin
          .from("agitation_tasks")
          .update({ status: "concluido" })
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
