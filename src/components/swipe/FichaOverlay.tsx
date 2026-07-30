// Ficha completa em tela cheia por cima da triagem.
// Reaproveita a tela de ficha já existente (/contatos/$id) num quadro embutido,
// então a fila de swipe atrás permanece intacta ao fechar.
import { X } from "lucide-react";

export function FichaOverlay({
  contactId,
  contactNome,
  onClose,
}: {
  contactId: string;
  contactNome: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ficha completa</p>
          <p className="truncate text-sm font-black">{contactNome}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-punch"
        >
          <X className="h-4 w-4" /> Fechar
        </button>
      </header>
      <iframe
        title={`Ficha de ${contactNome}`}
        src={`/contatos/${contactId}`}
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}
