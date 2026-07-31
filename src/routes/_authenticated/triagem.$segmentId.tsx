// Triagem de segmento por swipe (mobile-first).
// Arrastar o card ou tocar nos botões faz exatamente a mesma coisa.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, HelpCircle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getSegmentTriageMeta } from "@/lib/segment-triage.functions";
import { useTriageQueue } from "@/hooks/use-triage-queue";
import { useSwipeGesture, type SwipeDirection } from "@/hooks/use-swipe-gesture";
import { ContactSwipeCard } from "@/components/swipe/ContactSwipeCard";
import { SwipeActionCluster } from "@/components/swipe/SwipeActionCluster";
import { AddNoteSheet } from "@/components/swipe/AddNoteSheet";
import { FichaOverlay } from "@/components/swipe/FichaOverlay";

export const Route = createFileRoute("/_authenticated/triagem/$segmentId")({
  head: () => ({ meta: [{ title: "Triagem do segmento" }] }),
  component: TriagePage,
});

const ACTION_LABEL = { arquivar: "Arquivado", manter: "Mantido", pular: "Pulado" } as const;

function TriagePage() {
  const { segmentId } = Route.useParams();
  const navigate = useNavigate();
  const metaFn = useServerFn(getSegmentTriageMeta);
  const meta = useQuery({
    queryKey: ["segment-triage-meta", segmentId],
    queryFn: () => metaFn({ data: { segmentId } }),
  });

  const queue = useTriageQueue(segmentId);
  const [noteOpen, setNoteOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Contadores explícitos: decisões já salvas + as desta sessão.
  // "Pular" nunca conta como triado — o contato volta para o fim da fila.
  const mantidos = (meta.data?.mantidos ?? 0) + queue.kept;
  const arquivados = (meta.data?.arquivados ?? 0) + queue.archived;
  const pulados = Math.max(meta.data?.pulados ?? 0, queue.deferredCount);
  const total = meta.data?.total ?? 0;
  const restantes = Math.max(0, total - mantidos);

  // Falhas de gravação precisam ser visíveis — antes ficavam num botão oculto.
  useEffect(() => {
    if (!queue.error) return;
    toast.error(queue.error);
    queue.clearError();
    void meta.refetch();
  }, [queue.error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arquivar tira o contato do segmento: recalcula o total para "Faltam" cair.
  useEffect(() => {
    if (queue.archived === 0) return;
    void meta.refetch();
  }, [queue.archived]); // eslint-disable-line react-hooks/exhaustive-deps


  const commit = useCallback(
    (dir: SwipeDirection) => {
      const kind = dir === "left" ? "arquivar" : dir === "right" ? "manter" : "pular";
      void queue.act(kind);
    },
    [queue],
  );

  const swipe = useSwipeGesture({ onCommit: commit, disabled: !queue.current || noteOpen || fichaOpen });

  const current = queue.current;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-muted/30">
      <header className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-background px-3 py-3">
        <Link to="/segmentos" aria-label="Voltar" className="rounded-md p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-black">{meta.data?.segment.nome ?? "Triagem"}</p>
          <p className="text-[11px] text-muted-foreground">
            {meta.data ? `Faltam ${restantes}` : "Carregando…"}
            {` · ${mantidos} mantido(s) · ${arquivados} arquivado(s)`}
            {pulados ? ` · ${pulados} pulado(s)` : ""}
          </p>
          {meta.data && total > 0 && (
            <div className="mx-auto mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.round(((total - restantes) / total) * 100))}%` }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Como funciona a triagem"
          className="rounded-md p-2 hover:bg-muted"
        >
          <HelpCircle className="h-5 w-5" />
        </button>

      </header>

      <div className="relative min-h-0 flex-1 px-4 pt-4">
        {queue.loading && (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando fila…
            </span>
          </div>
        )}

        {!queue.loading && !current && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-7 w-7" />
              </div>
              <p className="text-lg font-black">Fila concluída</p>
              <p className="text-sm text-muted-foreground">
                Você triou {queue.reviewed} contato(s) deste segmento. Se entrarem contatos novos, eles aparecem aqui.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/segmentos" })}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground shadow-punch"
              >
                Voltar aos segmentos
              </button>
            </div>
          </div>
        )}

        {current && (
          <div className="relative mx-auto h-full max-w-md">
            {queue.next && <ContactSwipeCard behind contact={queue.next} />}
            <ContactSwipeCard
              key={current.id}
              contact={current}
              delta={swipe.delta}
              dragging={swipe.dragging}
              hint={swipe.hint}
              handlers={swipe.handlers}
              onAddNote={() => setNoteOpen(true)}
            />
          </div>
        )}
      </div>

      {queue.lastAction && (
        <div className="shrink-0 px-4 pt-3">
          <button
            type="button"
            onClick={() => void queue.undo()}
            className="mx-auto flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs font-bold shadow-punch"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Desfazer: {ACTION_LABEL[queue.lastAction.kind]} — {queue.lastAction.contact.nome}
          </button>
        </div>
      )}

      <div
        className="shrink-0 px-4 pb-4 pt-3"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <SwipeActionCluster
          disabled={!current}
          canUndo={Boolean(queue.lastAction)}
          onArchive={() => void queue.act("arquivar")}
          onKeep={() => void queue.act("manter")}
          onSkip={() => void queue.act("pular")}
          onOpenFicha={() => setFichaOpen(true)}
          onUndo={() => void queue.undo()}
        />
      </div>


      {noteOpen && current && (
        <AddNoteSheet
          contactId={current.id}
          contactNome={current.nome}
          onClose={() => setNoteOpen(false)}
          onSaved={(note) =>
            queue.patchCurrent({ ultima_observacao: { note, created_at: new Date().toISOString() } })
          }
        />
      )}

      {fichaOpen && current && (
        <FichaOverlay contactId={current.id} contactNome={current.nome} onClose={() => setFichaOpen(false)} />
      )}
    </div>
  );
}
