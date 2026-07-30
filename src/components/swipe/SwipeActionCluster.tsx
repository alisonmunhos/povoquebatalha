// Botões grandes de ação da triagem — mesma ação do gesto, alinhados pro polegar.
import { Archive, ChevronDown, Check, IdCard, Undo2 } from "lucide-react";

export function SwipeActionCluster({
  onArchive,
  onKeep,
  onSkip,
  onOpenFicha,
  onUndo,
  canUndo,
  disabled,
}: {
  onArchive: () => void;
  onKeep: () => void;
  onSkip: () => void;
  onOpenFicha: () => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled?: boolean;
}) {
  const base =
    "grid place-items-center rounded-full text-white shadow-punch transition active:scale-95 disabled:opacity-40";
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenFicha}
          disabled={disabled}
          aria-label="Abrir ficha completa"
          className={`${base} h-14 w-14 bg-primary text-primary-foreground`}
        >
          <IdCard className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Desfazer última ação"
          className="grid h-12 w-12 place-items-center rounded-full border-2 bg-background transition active:scale-95 disabled:opacity-40"
        >
          <Undo2 className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-end justify-center gap-5">
        <button
          type="button"
          onClick={onArchive}
          disabled={disabled}
          aria-label="Arquivar contato"
          className={`${base} h-16 w-16 bg-destructive`}
        >
          <Archive className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          aria-label="Pular para o fim da fila"
          className={`${base} h-14 w-14 bg-[#7B4B94]`}
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={onKeep}
          disabled={disabled}
          aria-label="Manter contato"
          className={`${base} h-16 w-16 bg-emerald-600`}
        >
          <Check className="h-7 w-7" />
        </button>
      </div>

      <div className="flex items-center gap-5 text-[11px] font-semibold text-muted-foreground">
        <span className="w-16 text-center">Arquivar</span>
        <span className="w-14 text-center">Pular</span>
        <span className="w-16 text-center">Manter</span>
      </div>
    </div>
  );
}
