import { useState } from "react";
import { AlertTriangle, Archive, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deleteDuplicateContacts } from "@/lib/duplicates.functions";
import { formatPhoneBR } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DeleteCandidate = {
  id: string;
  nome: string | null;
  phone_e164?: string | null;
  phone_raw?: string | null;
  email?: string | null;
  is_system_user?: boolean | null;
};

type Props = {
  /** Todos os contatos do bloco de repetidos. */
  group: DeleteCandidate[];
  /** Contatos escolhidos para sair da base. */
  targets: DeleteCandidate[];
  onClose: () => void;
  onDone: () => void;
};

function phoneOf(c: DeleteCandidate) {
  return formatPhoneBR(c.phone_e164 ?? null) || c.phone_raw || "sem telefone";
}

export function DeleteDuplicatesDialog({ group, targets, onClose, onDone }: Props) {
  const deleteFn = useServerFn(deleteDuplicateContacts);
  const [loading, setLoading] = useState<"hard" | "arquivar" | null>(null);
  const [confirmarTudo, setConfirmarTudo] = useState(false);

  const targetIds = targets.map((t) => t.id);
  const remaining = group.filter((c) => !targetIds.includes(c.id));
  const bloqueados = targets.filter((t) => t.is_system_user);
  const removeTudo = remaining.length === 0;
  const invalido = bloqueados.length > 0 || (removeTudo && !confirmarTudo);

  async function run(mode: "hard" | "arquivar") {
    setLoading(mode);
    try {
      const r = await deleteFn({
        data: { group_ids: group.map((c) => c.id), delete_ids: targetIds, mode },
      });
      toast.success(
        mode === "hard"
          ? `${r.removidos} cadastro(s) excluído(s). ${r.restantes} permanece(m) na base.`
          : `${r.removidos} cadastro(s) tirado(s) da base. ${r.restantes} permanece(m).`,
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir");
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Retirar {targets.length} cadastro{targets.length > 1 ? "s" : ""} repetido
            {targets.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Confira quem sai e quem fica antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Sai da lista
            </div>
            <ul className="space-y-1">
              {targets.map((t) => (
                <li key={t.id} className="rounded-md border px-3 py-2">
                  <div className="font-medium truncate">{t.nome ?? "Sem nome"}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{phoneOf(t)}</div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Permanece na base
            </div>
            {remaining.length === 0 ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-2 text-destructive">
                <div>
                  Nenhum cadastro vai permanecer na base — este bloco de repetidos será apagado por
                  completo.
                </div>
                <label className="flex items-start gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmarTudo}
                    onChange={(e) => setConfirmarTudo(e.target.checked)}
                  />
                  Entendi que nenhum cadastro será mantido
                </label>
              </div>
            ) : (
              <ul className="space-y-1">
                {remaining.map((t) => (
                  <li key={t.id} className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                    <div className="font-medium truncate">{t.nome ?? "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{phoneOf(t)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>


          {bloqueados.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive">
              {bloqueados.map((b) => b.nome).join(", ")} tem acesso ao sistema e não pode ser
              excluído aqui. Use “Unificar cadastros”.
            </div>
          )}

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <strong className="text-foreground">Atenção:</strong> excluir de vez apaga o histórico,
            as mensagens e as tags desse cadastro. Se quiser guardar o histórico, prefira “Tirar da
            base”, que só esconde o contato. Para juntar as informações num cadastro só, use
            “Unificar cadastros”.
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading !== null}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => run("arquivar")}
            disabled={invalido || loading !== null}
          >
            <Archive className="h-4 w-4 mr-1.5" />
            {loading === "arquivar" ? "Tirando…" : "Tirar da base (guarda histórico)"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => run("hard")}
            disabled={invalido || loading !== null}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {loading === "hard" ? "Excluindo…" : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
