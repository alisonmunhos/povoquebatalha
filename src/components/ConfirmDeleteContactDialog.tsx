import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

export type ConfirmDeleteContactProps = {
  open: boolean;
  onClose: () => void;
  /** Single contact display name (individual mode). If provided, expects the word "EXCLUIR". */
  contactName?: string | null;
  /** Bulk mode: number of contacts. Expects the user to type this number. */
  bulkCount?: number;
  onConfirm: (typed: string) => Promise<void>;
};

export function ConfirmDeleteContactDialog({
  open, onClose, contactName, bulkCount, onConfirm,
}: ConfirmDeleteContactProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const isBulk = typeof bulkCount === "number";
  const expected = isBulk ? String(bulkCount) : "EXCLUIR";
  const match = typed.trim() === expected;

  async function handle() {
    if (!match) return;
    setBusy(true);
    try {
      await onConfirm(typed.trim());
      setTyped("");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setTyped(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir {isBulk ? `${bulkCount} contatos` : "contato"} definitivamente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="font-medium text-destructive">Esta ação não pode ser desfeita.</p>
            <p className="text-muted-foreground mt-1">
              {isBulk
                ? `Você vai apagar ${bulkCount} contato(s) permanentemente. Serão removidos: dados pessoais, telefone, endereço, tags, mensagens enviadas e recebidas, log de auditoria e histórico de campanhas.`
                : <>Você vai apagar <strong>{contactName ?? "este contato"}</strong> permanentemente. Serão removidos: dados pessoais, telefone, endereço, tags, mensagens enviadas e recebidas, log de auditoria e histórico de campanhas.</>}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              A exclusão fica registrada no log de acesso (quem, quando, dados básicos), para atender pedidos de LGPD.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium">
              Para confirmar, digite <code className="px-1 py-0.5 rounded bg-muted text-foreground">{expected}</code>:
            </label>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expected}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!match || busy}
            onClick={handle}
          >
            {busy ? "Excluindo…" : isBulk ? `Excluir ${bulkCount}` : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
