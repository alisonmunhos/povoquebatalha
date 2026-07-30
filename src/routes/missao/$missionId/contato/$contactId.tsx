import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { renderMessageVars, type MessageVarContact } from "@/lib/message-vars";
import { getMissionMeta } from "@/lib/mission-meta.functions";
import { getRequestOrigin } from "@/lib/site-origin.functions";
import { OG_DEFAULT_IMAGE, SITE_URL } from "@/lib/site-meta";

export const Route = createFileRoute("/missao/$missionId/contato/$contactId")({
  ssr: "data-only",
  loader: async ({ params }) => {
    const [meta, origin] = await Promise.all([
      getMissionMeta({ data: { mission_id: params.missionId } }),
      getRequestOrigin(),
    ]);
    return { meta, origin };
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.meta?.title ?? "Minhas tarefas de agitação";
    const description = "Abra sua lista de contatos e envie a mensagem da missão.";
    const origin = loaderData?.origin ?? SITE_URL;
    const imageVersion = loaderData?.meta?.imageVersion
      ? `?v=${encodeURIComponent(loaderData.meta.imageVersion)}`
      : "";
    const imageUrl = loaderData?.meta?.hasMedia
      ? `${origin}/api/public/agitation-missions/${params.missionId}/og-image${imageVersion}`
      : OG_DEFAULT_IMAGE;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:site_name", content: "Campanha do Povo que Batalha" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: imageUrl },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:image", content: imageUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: MissionExecutorPage,
});


type Task = {
  id: string;
  status: string;
  assigned_at: string | null;
  contact:
    | (MessageVarContact & { id?: string; phone_e164: string | null; phone_raw: string | null })
    | null;
};

const STATUS_LABEL: Record<string, string> = {
  concluido: "Concluído",
  nao_enviado: "Não enviado",
};
const STATUS_BADGE: Record<string, string> = {
  concluido: "bg-emerald-100 text-emerald-800",
  nao_enviado: "bg-rose-100 text-rose-800",
};

function digitsFromPhone(c: Task["contact"]): string {
  return ((c?.phone_e164 ?? c?.phone_raw ?? "") as string).replace(/\D/g, "");
}

function formatDate(iso: string | null): string {
  if (!iso) return "Sem data";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function ContactCard({
  task,
  messageTemplate,
  missionId,
  contactId,
  onMarked,
}: {
  task: Task;
  messageTemplate: string;
  missionId: string;
  contactId: string;
  onMarked: (taskId: string, status: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function mark(action: "concluido" | "nao_enviado", openWhatsapp: boolean) {
    if (openWhatsapp) {
      const digits = digitsFromPhone(task.contact);
      if (!digits) return;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const rendered = renderMessageVars(messageTemplate, task.contact ?? {}, { origin });
      window.open(
        `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(rendered)}`,
        "_blank",
      );
    }
    setBusy(true);
    try {
      await fetch(`/api/public/agitation-missions/${missionId}/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, action }),
      });
      onMarked(task.id, action);
    } finally {
      setBusy(false);
    }
  }

  const badgeClass = STATUS_BADGE[task.status];

  return (
    <div className="rounded-lg border p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <div className="font-medium">
          {task.contact?.nome_social?.trim() || task.contact?.nome || "(sem nome)"}
        </div>
        <div className="text-xs text-muted-foreground">
          {task.contact?.phone_e164 ?? task.contact?.phone_raw ?? "—"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badgeClass && (
          <span className={`text-xs rounded-full px-3 py-1 ${badgeClass}`}>
            {STATUS_LABEL[task.status]}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => mark("concluido", true)}
          className="text-sm rounded-md bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-60"
        >
          Enviar Mensagem
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => mark("nao_enviado", false)}
          className="text-sm rounded-md border border-rose-300 text-rose-700 px-3 py-1.5 hover:bg-rose-50 disabled:opacity-60"
        >
          Não consegui enviar
        </button>
      </div>
    </div>
  );
}

function MissionExecutorPage() {
  const { missionId, contactId } = Route.useParams();
  const [mission, setMission] = useState<{
    title: string;
    message_template: string;
    media_url?: string | null;
    media_filename?: string | null;
  } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [paused, setPaused] = useState(false);
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
        setPaused(!!r.paused);
        setTasks((r.tasks ?? []) as Task[]);
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

  function onMarked(taskId: string, status: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  const groups = useMemo(() => {
    const byDate = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.assigned_at ? t.assigned_at.slice(0, 10) : "sem-data";
      const arr = byDate.get(key) ?? [];
      arr.push(t);
      byDate.set(key, arr);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({ label: formatDate(items[0]?.assigned_at ?? null), key, items }));
  }, [tasks]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (errorMsg) return <div className="p-6 text-sm text-destructive">{errorMsg}</div>;
  if (!mission) return null;

  if (paused) {
    return (
      <div className="min-h-screen bg-muted/20 p-4 flex items-center justify-center">
        <div className="max-w-sm text-center space-y-2">
          <h1 className="text-lg font-semibold">{mission.title}</h1>
          <p className="text-sm text-muted-foreground">
            Esta missão está pausada no momento — aguarde novas instruções.
          </p>
        </div>
      </div>
    );
  }

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
        {mission.media_url && (
          <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
            <img
              src={mission.media_url}
              alt="Imagem da missão"
              className="h-16 w-16 rounded object-cover"
            />
            <div className="flex-1 min-w-[120px]">
              <p className="text-xs font-medium">Imagem para enviar junto</p>
              <p className="text-[11px] text-muted-foreground">
                Baixe e anexe no WhatsApp junto com a mensagem.
              </p>
            </div>
            <a
              href={mission.media_url}
              download={mission.media_filename ?? "imagem-da-missao"}
              target="_blank"
              rel="noreferrer"
              className="text-sm rounded-md border px-3 py-1.5 hover:bg-muted"
            >
              Baixar
            </a>
          </div>
        )}
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum contato atribuído a você nesta missão.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            {groups.length > 1 && (
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Atribuído em {g.label}
              </div>
            )}
            {g.items.map((t) => (
              <ContactCard
                key={t.id}
                task={t}
                messageTemplate={mission.message_template}
                missionId={missionId}
                contactId={contactId}
                onMarked={onMarked}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
