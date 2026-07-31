// Fila da triagem por swipe.
// - Segmento dinâmico: recarrega a primeira página quando a fila esvazia, então
//   quem entrou no segmento depois do início aparece sem sair da tela.
// - "Pular" manda o card para o fim (volta quando os outros acabarem).
// - Histórico das últimas ações alimenta o botão Desfazer.
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listSegmentTriageQueue,
  recordTriageDecision,
  undoTriageDecision,
  type TriageContact,
} from "@/lib/segment-triage.functions";
import { archiveContact } from "@/lib/contacts.functions";

export type TriageActionKind = "arquivar" | "manter" | "pular";

export type TriageHistoryEntry = {
  contact: TriageContact;
  kind: TriageActionKind;
};

const HISTORY_LIMIT = 20;

export function useTriageQueue(segmentId: string) {
  const fetchPage = useServerFn(listSegmentTriageQueue);
  const archiveFn = useServerFn(archiveContact);
  const recordFn = useServerFn(recordTriageDecision);
  const undoFn = useServerFn(undoTriageDecision);

  const [queue, setQueue] = useState<TriageContact[]>([]);
  const [deferred, setDeferred] = useState<TriageContact[]>([]);
  const [history, setHistory] = useState<TriageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  const decided = useRef<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());
  const page = useRef(0);
  const hasMore = useRef(true);
  const busy = useRef(false);

  const absorb = useCallback((rows: TriageContact[]) => {
    const fresh = rows.filter((c) => !decided.current.has(c.id) && !seen.current.has(c.id));
    for (const c of fresh) seen.current.add(c.id);
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
    return fresh.length;
  }, []);

  /** Carrega a próxima página; se acabou, reinjeta pulados e revarre do começo. */
  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      if (hasMore.current) {
        const r = await fetchPage({ data: { segmentId, page: page.current } });
        page.current += 1;
        hasMore.current = r.hasMore;
        const added = absorb(r.contacts);
        if (added === 0 && r.hasMore) {
          busy.current = false;
          await loadMore();
          return;
        }
        if (added > 0) setExhausted(false);
      } else {
        // Fim da lista: primeiro devolve os pulados…
        let devolvidos = 0;
        setDeferred((d) => {
          if (d.length) {
            devolvidos = d.length;
            setQueue((q) => [...q, ...d]);
            return [];
          }
          return d;
        });
        // …e revarre a fonte pra capturar entradas novas (segmento dinâmico).
        page.current = 0;
        hasMore.current = true;
        seen.current = new Set(decided.current);
        const r = await fetchPage({ data: { segmentId, page: 0 } });
        page.current = 1;
        hasMore.current = r.hasMore;
        const added = absorb(r.contacts);
        if (added === 0 && devolvidos === 0) setExhausted(true);
        else setExhausted(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a fila.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [absorb, fetchPage, segmentId]);

  useEffect(() => {
    setQueue([]);
    setDeferred([]);
    setHistory([]);
    setReviewed(0);
    setExhausted(false);
    setLoading(true);
    decided.current = new Set();
    seen.current = new Set();
    page.current = 0;
    hasMore.current = true;
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId]);

  // Mantém a fila abastecida.
  useEffect(() => {
    if (loading) return;
    if (queue.length <= 2 && !busy.current && !exhausted) void loadMore();
  }, [queue.length, loading, exhausted, loadMore]);

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;

  const pushHistory = useCallback((entry: TriageHistoryEntry) => {
    setHistory((h) => [entry, ...h].slice(0, HISTORY_LIMIT));
  }, []);

  const act = useCallback(
    async (kind: TriageActionKind) => {
      const c = queue[0];
      if (!c) return;
      setQueue((q) => q.slice(1));

      // Volta o contato pro topo quando o servidor recusa a ação —
      // nada de progresso fantasma.
      const rollback = (msg: string) => {
        setError(msg);
        decided.current.delete(c.id);
        setQueue((q) => [c, ...q.filter((x) => x.id !== c.id)]);
        setDeferred((d) => d.filter((x) => x.id !== c.id));
        setHistory((h) => h.filter((e) => e.contact.id !== c.id));
        setExhausted(false);
      };

      if (kind === "pular") {
        setDeferred((d) => [...d, c]);
        pushHistory({ contact: c, kind });
        try {
          await recordFn({ data: { segmentId, contactId: c.id, decision: "pular" } });
        } catch (e) {
          rollback(e instanceof Error ? e.message : "Não foi possível registrar o pulo.");
        }
        return;
      }

      decided.current.add(c.id);
      setReviewed((n) => n + 1);
      pushHistory({ contact: c, kind });

      if (kind === "arquivar") {
        try {
          await archiveFn({ data: { id: c.id, archived: true } });
        } catch (e) {
          setReviewed((n) => Math.max(0, n - 1));
          rollback(e instanceof Error ? e.message : "Não foi possível arquivar este contato.");
          return;
        }
      }

      try {
        await recordFn({ data: { segmentId, contactId: c.id, decision: kind } });
      } catch (e) {
        setReviewed((n) => Math.max(0, n - 1));
        if (kind === "arquivar") {
          try {
            await archiveFn({ data: { id: c.id, archived: false } });
          } catch {
            /* mantém arquivado; o aviso abaixo explica que não foi registrado */
          }
        }
        rollback(e instanceof Error ? e.message : "Não foi possível salvar sua decisão.");
      }
    },
    [archiveFn, pushHistory, queue, recordFn, segmentId],
  );

  const undo = useCallback(async () => {
    const entry = history[0];
    if (!entry) return;
    setHistory((h) => h.slice(1));
    const c = entry.contact;

    if (entry.kind === "pular") {
      setDeferred((d) => d.filter((x) => x.id !== c.id));
    } else {
      decided.current.delete(c.id);
      setReviewed((n) => Math.max(0, n - 1));
      if (entry.kind === "arquivar") {
        try {
          await archiveFn({ data: { id: c.id, archived: false } });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Não foi possível desfazer o arquivamento.");
        }
      }
    }
    try {
      await undoFn({ data: { segmentId, contactId: c.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desfazer o registro.");
    }
    seen.current.add(c.id);
    setQueue((q) => [c, ...q.filter((x) => x.id !== c.id)]);
    setExhausted(false);
    return entry;
  }, [archiveFn, history, segmentId, undoFn]);

  /** Atualiza o card atual em memória (ex.: depois de salvar uma observação). */
  const patchCurrent = useCallback((patch: Partial<TriageContact>) => {
    setQueue((q) => (q.length ? [{ ...q[0], ...patch }, ...q.slice(1)] : q));
  }, []);

  return {
    current,
    next,
    queue,
    deferredCount: deferred.length,
    reviewed,
    loading,
    error,
    exhausted: exhausted && queue.length === 0,
    lastAction: history[0] ?? null,
    act,
    undo,
    patchCurrent,
    clearError: () => setError(null),
  };
}
