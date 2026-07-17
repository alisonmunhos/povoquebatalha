import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { renderMessageVars, type MessageVarContact } from "@/lib/message-vars";

export const Route = createFileRoute("/missao/$missionId/contato/$contactId")({
  head: () => ({ meta: [{ title: "Minhas tarefas de agitação" }] }),
  ssr: false,
  component: MissionExecutorPage,
});

type Task = {
  id: string;
  status: string;
  contact:
    | (MessageVarContact & { id?: string; phone_e164: string | null; phone_raw: string | null })
    | null;
};

function digitsFromPhone(c: Task["contact"]): string {
  return ((c?.phone_e164 ?? c?.phone_raw ?? "") as string).replace(/\D/g, "");
}

function ContactCard({
  task,
  messageTemplate,
  missionId,
  contactId,
  onCompleted,
}: {
  task: Task;
  messageTemplate: string;
  missionId: string;
  contactId: string;
  onCompleted: (taskId: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onSend() {
    const digits = digitsFromPhone(task.contact);
    if (!digits) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const rendered = renderMessageVars(messageTemplate, task.contact ?? {}, { origin });
    window.open(
      `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(rendered)}`,
      "_blank",
    );
    setBusy(true);
    try {
      await fetch(`/api/public/agitation-missions/${missionId}/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id }),
      });
      onCompleted(task.id);
    } finally {
      setBusy(false);
    }
  }

  const concluded = task.status === "concluido";

  return (
    <div className="rounded-lg border p-4 flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">
          {task.contact?.nome_social?.trim() || task.contact?.nome || "(sem nome)"}
        </div>
        <div className="text-xs text-muted-foreground">
          {task.contact?.phone_e164 ?? task.contact?.phone_raw ?? "—"}
        </div>
      </div>
      {concluded ? (
        <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 px-3 py-1">
          Concluído
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onSend}
          className="text-sm rounded-md bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-60"
        >
          Enviar Mensagem
        </button>
      )}
    </div>
  );
}

function MissionExecutorPage() {
  const { missionId, contactId } = Route.useParams();
  const [mission, setMission] = useState<{
    id: string;
    title: string;
    message_template: string;
  } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/agitation-missions/${missionId}/${contactId}`);
        const r = await res.json();
        if (cancelled) return;
        if (!r.ok) throw new Error(r.error ?? "Erro ao carregar missão.");
        setMission(r.mission);
        setTasks(r.tasks as Task[]);
      } catch (e) {
        if (!cancelled) setErrorMsg(e instanceof Error ? e.message : "Erro ao carregar missão.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId, contactId]);

  function onCompleted(taskId: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: "concluido" } : t)));
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (errorMsg) return <div className="p-6 text-sm text-destructive">{errorMsg}</div>;
  if (!mission) return null;

  const pendentes = tasks.filter((t) => t.status !== "concluido").length;

  return (
    <div className="min-h-screen bg-muted/20 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div>
          <h1 className="text-lg font-semibold">{mission.title}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {tasks.length} contato(s) atribuído(s) a você · {pendentes} pendente(s)
          </p>
        </div>
        <div className="space-y-2">
          {tasks.map((t) => (
            <ContactCard
              key={t.id}
              task={t}
              messageTemplate={mission.message_template}
              missionId={missionId}
              contactId={contactId}
              onCompleted={onCompleted}
            />
          ))}
          {tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum contato atribuído a você nesta missão.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
