// Gera e lista links de tarefa de triagem de um segmento.
// O link exige login: ele aponta a tarefa, não libera dados.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Copy, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createSegmentTriageShare,
  listSegmentTriageShares,
  revokeSegmentTriageShare,
} from "@/lib/segment-triage.functions";

export function ShareTriageModal({
  segmentId,
  segmentNome,
  onClose,
}: {
  segmentId: string;
  segmentNome: string;
  onClose: () => void;
}) {
  const listFn = useServerFn(listSegmentTriageShares);
  const createFn = useServerFn(createSegmentTriageShare);
  const revokeFn = useServerFn(revokeSegmentTriageShare);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["segment-triage-shares", segmentId],
    queryFn: () => listFn({ data: { segmentId } }),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function create() {
    setCreating(true);
    try {
      const r = await createFn({ data: { segmentId, label: label.trim() || null } });
      setLabel("");
      await q.refetch();
      await copy(`${origin}/triagem-tarefa/${r.share.token}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o link.");
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.info(url);
    }
  }

  async function revoke(id: string) {
    await revokeFn({ data: { id } });
    toast.success("Link desativado");
    q.refetch();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full space-y-4 rounded-t-3xl border bg-background p-5 shadow-punch sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-black">
              <Share2 className="h-4 w-4" /> Compartilhar triagem
            </p>
            <p className="truncate text-xs text-muted-foreground">{segmentNome}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          Quem receber o link precisa entrar com a conta dele no sistema. O link indica a tarefa; os contatos
          continuam protegidos pelas permissões de cada usuário.
        </p>

        <div className="space-y-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="Nome da tarefa (ex.: Triagem João - semana 1)"
            className="w-full rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-50"
          >
            {creating && <Loader2 className="h-4 w-4 animate-spin" />} Gerar link e copiar
          </button>
        </div>

        <div className="max-h-56 space-y-2 overflow-y-auto">
          {q.isLoading && <p className="text-xs text-muted-foreground">Carregando links…</p>}
          {q.data?.shares.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border p-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.label || "Sem nome"}</p>
                <p className="truncate text-muted-foreground">
                  {s.is_active ? "Ativo" : "Desativado"} · {s.use_count} abertura(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => copy(`${origin}/triagem-tarefa/${s.token}`)}
                aria-label="Copiar link"
                className="rounded-md p-1.5 hover:bg-muted"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {s.is_active && (
                <button type="button" onClick={() => revoke(s.id)} className="font-semibold text-destructive">
                  Desativar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
