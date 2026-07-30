import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Send, PlayCircle, AlertTriangle } from "lucide-react";
import {
  listMyMissions,
  claimMissionBatch,
  completeMissionClaim,
  getMissionCooldownStatus,
  markMyMissionTask,
  getMissionMediaUrl,
} from "@/lib/agitation-missions.functions";
import { Button } from "@/components/ui/button";
import { renderMessageVars, type MessageVarContact } from "@/lib/message-vars";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/minhas-missoes")({
  validateSearch: (search: Record<string, unknown>) => ({
    mission: typeof search.mission === "string" ? search.mission : undefined,
  }),
  head: () => ({ meta: [{ title: "Minhas Missões — Povo que Batalha" }] }),
  component: MyMissionsPage,
});

type ContactShape = MessageVarContact & {
  id?: string;
  phone_e164: string | null;
  phone_raw: string | null;
};

type Task = {
  id: string;
  status: string;
  claim_id: string | null;
  completed_at: string | null;
  contacts: ContactShape | null;
};

type MissionBlock = {
  mission: {
    id: string;
    title: string;
    message_template: string;
    instructions: string | null;
    coordinator_phone: string | null;
    whatsapp_message_template: string | null;
    cooldown_minutes: number;
    batch_size: number;
    is_open: boolean;
    paused_at: string | null;
    media_path?: string | null;
    media_filename?: string | null;
  };
  claim: { id: string; completed_at: string | null; claimed_at: string } | null;
  tasks: Task[];
  pending: number;
  concluded: number;
};

/** Mostra a imagem da missão pro agitador baixar e anexar no WhatsApp. */
function MissionMediaBlock({ path, filename }: { path: string; filename: string }) {
  const mediaFn = useServerFn(getMissionMediaUrl);
  const q = useQuery({
    queryKey: ["mission-media", path],
    queryFn: () => mediaFn({ data: { path } }),
    staleTime: 30 * 60_000,
  });
  if (!q.data?.url) return null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border bg-background p-2">
      <img src={q.data.url} alt="Imagem da missão" className="h-16 w-16 rounded object-cover" />
      <div className="flex-1 min-w-[140px]">
        <p className="text-xs font-medium">Imagem para enviar junto</p>
        <p className="text-[11px] text-muted-foreground">
          Baixe e anexe no WhatsApp junto com a mensagem.
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={q.data.url} download={filename} target="_blank" rel="noreferrer">
          Baixar
        </a>
      </Button>
    </div>
  );
}

function digitsFromPhone(c: ContactShape | null): string {
  return ((c?.phone_e164 ?? c?.phone_raw ?? "") as string).replace(/\D/g, "");
}

function MyMissionsPage() {
  const listFn = useServerFn(listMyMissions);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-missions"], queryFn: () => listFn() });
  const { mission: focusMissionId } = Route.useSearch();

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  const missions = (q.data?.missions ?? []) as MissionBlock[];

  function refetchAll() {
    qc.invalidateQueries({ queryKey: ["my-missions"] });
    qc.invalidateQueries({ queryKey: ["mission-cooldown"] });
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl">Minhas missões</h1>
        <p className="text-sm text-muted-foreground">
          Suas levas ativas de agitação. Envie no WhatsApp e marque o resultado.
        </p>
      </div>

      {missions.length === 0 && (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nenhuma missão ativa no momento.
        </div>
      )}

      {missions.map((m) => (
        <MissionBlockCard
          key={m.mission.id}
          block={m}
          onChanged={refetchAll}
          focused={focusMissionId === m.mission.id}
        />
      ))}
    </div>
  );
}

function MissionBlockCard({
  block,
  onChanged,
  focused = false,
}: {
  block: MissionBlock;
  onChanged: () => void;
  focused?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focused]);
  const cooldownFn = useServerFn(getMissionCooldownStatus);
  const claimFn = useServerFn(claimMissionBatch);
  const completeFn = useServerFn(completeMissionClaim);
  const markFn = useServerFn(markMyMissionTask);
  const [busy, setBusy] = useState(false);

  const cooldownQ = useQuery({
    queryKey: ["mission-cooldown", block.mission.id],
    queryFn: () => cooldownFn({ data: { mission_id: block.mission.id } }),
    enabled: block.mission.is_open,
    refetchInterval: 60_000,
  });

  const [awaitingConfirm, setAwaitingConfirm] = useState<Set<string>>(new Set());

  const pendingTasks = block.tasks.filter((t) => !t.completed_at && t.status === "pending");
  const sentTasks = block.tasks.filter((t) => t.status === "concluido");
  const notSentTasks = block.tasks.filter((t) => t.status === "nao_enviado");
  const openClaim = block.claim;

  /** Abre o WhatsApp; NÃO marca nada — só coloca a tarefa em "aguardando confirmação". */
  function onOpenWhatsApp(task: Task) {
    const digits = digitsFromPhone(task.contacts);
    if (!digits) return toast.error("Contato sem telefone.");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const rendered = renderMessageVars(block.mission.message_template, task.contacts ?? {}, {
      origin,
    });
    window.open(
      `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(rendered)}`,
      "_blank",
    );
    setAwaitingConfirm((prev) => new Set(prev).add(task.id));
  }

  async function onMarkTask(task: Task, status: "concluido" | "nao_enviado") {
    try {
      await markFn({ data: { task_id: task.id, status } });
      setAwaitingConfirm((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao marcar.");
    }
  }

  async function onComplete() {
    if (!openClaim) return;
    if (pendingTasks.length > 0) {
      if (!confirm(`Você ainda tem ${pendingTasks.length} pendente(s). Concluir mesmo assim?`))
        return;
    }
    setBusy(true);
    try {
      await completeFn({ data: { claim_id: openClaim.id } });
      // Abre wa.me pro coordenador
      if (block.mission.coordinator_phone) {
        const digits = block.mission.coordinator_phone.replace(/\D/g, "");
        const msg = block.mission.whatsapp_message_template ?? "Concluí minha leva!";
        window.open(
          `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(msg)}`,
          "_blank",
        );
      }
      toast.success("Leva concluída! 💪");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao concluir.");
    } finally {
      setBusy(false);
    }
  }

  async function onClaimMore() {
    setBusy(true);
    try {
      const r = await claimFn({ data: { mission_id: block.mission.id } });
      if (!r.task_ids.length) {
        toast.info("Não há mais contatos disponíveis nesta missão.");
      } else {
        toast.success(`${r.task_ids.length} contato(s) atribuído(s) a você.`);
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pegar lote.");
    } finally {
      setBusy(false);
    }
  }

  const cd = cooldownQ.data;
  const releasesIn =
    cd?.releases_at && new Date(cd.releases_at).getTime() > Date.now()
      ? formatDistanceToNow(new Date(cd.releases_at), { locale: ptBR })
      : null;

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border bg-card overflow-hidden ${
        focused ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="p-4 border-b bg-primary/5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display text-lg">{block.mission.title}</h2>
          {block.mission.paused_at && (
            <span className="text-xs rounded-full bg-rose-100 text-rose-800 px-2 py-0.5">
              INTERROMPIDA
            </span>
          )}
        </div>
        {block.mission.instructions && (
          <p className="text-sm text-foreground/80 mt-2 whitespace-pre-wrap">
            {block.mission.instructions}
          </p>
        )}
        {block.mission.media_path && (
          <MissionMediaBlock
            path={block.mission.media_path}
            filename={block.mission.media_filename ?? "imagem-da-missao"}
          />
        )}
        <div className="text-xs text-muted-foreground mt-2">
          {block.tasks.length} contato(s) na sua leva · {sentTasks.length} enviado(s) ·{" "}
          {pendingTasks.length} pendente(s) · {notSentTasks.length} não enviado(s)
        </div>
      </div>

      {block.tasks.length > 0 && (
        <div className="divide-y">
          {block.tasks.map((t) => {
            const waiting = awaitingConfirm.has(t.id);
            const sent = t.status === "concluido";
            const notSent = t.status === "nao_enviado";
            return (
              <div key={t.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium text-sm">
                    {t.contacts?.nome_social?.trim() || t.contacts?.nome || "(sem nome)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.contacts?.phone_e164 ?? t.contacts?.phone_raw ?? "—"}
                  </div>
                  <span
                    className={`mt-1 inline-block text-[11px] rounded-full px-2 py-0.5 ${
                      sent
                        ? "bg-emerald-100 text-emerald-800"
                        : notSent
                          ? "bg-rose-100 text-rose-800"
                          : waiting
                            ? "bg-amber-100 text-amber-800"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {sent
                      ? "Enviado"
                      : notSent
                        ? "Não enviei"
                        : waiting
                          ? "Aguardando confirmação"
                          : "Pendente"}
                  </span>
                </div>

                <Button
                  size="sm"
                  variant={sent || notSent ? "outline" : "default"}
                  onClick={() => onOpenWhatsApp(t)}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {sent || notSent ? "Abrir WhatsApp" : "Enviar"}
                </Button>

                {!sent && (
                  <Button size="sm" variant="secondary" onClick={() => onMarkTask(t, "concluido")}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Enviei
                  </Button>
                )}
                {!notSent && (
                  <Button size="sm" variant="outline" onClick={() => onMarkTask(t, "nao_enviado")}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Não consegui enviar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}


      <div className="p-3 border-t bg-muted/30 flex flex-col gap-2">
        {openClaim && (
          <Button onClick={onComplete} disabled={busy} className="w-full" size="lg">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Avisar que concluí
          </Button>
        )}
        {block.mission.is_open && !block.mission.paused_at && (
          <>
            {cd?.block_reason === "leva_aberta" && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Você tem uma <strong>leva em aberto</strong>. Conclua os contatos e clique em
                  &quot;Avisar que concluí&quot; antes de pegar mais.
                </span>
              </div>
            )}
            {cd?.block_reason === "cooldown" && releasesIn && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Aguarde <strong>{releasesIn}</strong> antes de pegar mais. Confira sua taxa de
                  resposta na leva anterior enquanto isso.
                </span>
              </div>
            )}
            {cd?.block_reason === "sem_contatos" && (
              <div className="text-xs text-muted-foreground bg-muted/40 border rounded p-2">
                Essa missão não tem mais contatos disponíveis no momento.
              </div>
            )}
            {cd?.can_claim && (
              <>
                <div className="text-xs text-muted-foreground italic px-1">
                  💡 Antes de pegar mais, dê uma olhada nas respostas da leva anterior.
                </div>
                <Button
                  variant="outline"
                  onClick={onClaimMore}
                  disabled={busy}
                  className="w-full"
                >
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Pegar mais {cd.batch_size} contato(s) ({cd.available_now} disponíveis)
                </Button>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
