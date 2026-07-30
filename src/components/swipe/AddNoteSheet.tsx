// Bottom sheet para registrar nova observação no histórico do contato.
// Usa a função de log já existente (logTerritoryAction com action="observacao").
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { logTerritoryAction } from "@/lib/territory-logs.functions";

export function AddNoteSheet({
  contactId,
  contactNome,
  onClose,
  onSaved,
}: {
  contactId: string;
  contactNome: string;
  onClose: () => void;
  onSaved: (note: string) => void;
}) {
  const logFn = useServerFn(logTerritoryAction);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const value = note.trim();
    if (!value) return;
    setSaving(true);
    try {
      await logFn({ data: { contactId, action: "observacao", note: value.slice(0, 500) } });
      toast.success("Observação registrada");
      onSaved(value);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a observação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full rounded-t-3xl border bg-background p-5 shadow-punch sm:max-w-md sm:rounded-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black">Nova observação</p>
            <p className="truncate text-xs text-muted-foreground">{contactNome}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1.5 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          maxLength={500}
          placeholder="O que você precisa registrar sobre esta pessoa?"
          className="w-full resize-none rounded-xl border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="mt-1 text-right text-[11px] text-muted-foreground">{note.length}/500</p>

        <button
          type="button"
          onClick={save}
          disabled={saving || !note.trim()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-black text-primary-foreground disabled:opacity-50"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar observação
        </button>
      </div>
    </div>
  );
}
