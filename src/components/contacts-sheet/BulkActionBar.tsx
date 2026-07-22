import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Copy, ChevronDown, MoreHorizontal } from "lucide-react";
import { SHEET_SELECT_ALL_MAX } from "@/lib/contacts-sheet.constants";

type CopyMode = "none" | "cidade" | "tag" | "disponibilidade";

export default function BulkActionBar({
  selection,
  selectAllByFilter,
  onCreateTag,
  onApplyTag,
  onExportSelected,
  onCopyFormatted,
  isMobile = false,
}: {
  selection: Set<string>;
  total?: number;
  selectAllByFilter: () => void;
  onCreateTag: (name: string) => Promise<{ id?: string } | null | undefined>;
  onApplyTag: (tagId: string) => Promise<void>;
  onExportSelected: () => Promise<void>;
  onCopyFormatted?: (mode: CopyMode) => Promise<void> | void;
  isMobile?: boolean;
}) {
  const hasSelection = selection.size > 0;

  async function handleCreateTag() {
    const tagName = prompt("Nome da nova tag:");
    if (!tagName) return;
    const tag = await onCreateTag(tagName);
    if (tag?.id) await onApplyTag(tag.id);
  }

  if (isMobile) {
    return (
      <div
        className={`bulk-action-bar sticky bottom-2 mt-3 flex items-center gap-2 p-2.5 border rounded-lg shadow-sm transition-colors ${
          hasSelection ? "bg-primary/5 border-primary/30" : "bg-card"
        }`}
      >
        <div className="text-sm font-medium min-w-0 truncate">
          {hasSelection ? `${selection.size} selecionado${selection.size > 1 ? "s" : ""}` : "Nenhum selecionado"}
        </div>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1 border rounded px-2.5 py-1.5 text-sm hover:bg-muted">
              <MoreHorizontal className="h-4 w-4" />
              Ações
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => selectAllByFilter()}>
              Selecionar tudo (até {SHEET_SELECT_ALL_MAX})
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!hasSelection} onClick={handleCreateTag}>
              Criar e aplicar tag
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasSelection} onClick={() => onExportSelected()}>
              Exportar CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Copiar formatado</DropdownMenuLabel>
            <DropdownMenuItem disabled={!hasSelection} onClick={() => onCopyFormatted?.("none")}>
              Lista simples
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasSelection} onClick={() => onCopyFormatted?.("cidade")}>
              Agrupado por cidade
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasSelection} onClick={() => onCopyFormatted?.("tag")}>
              Agrupado por tag
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasSelection} onClick={() => onCopyFormatted?.("disponibilidade")}>
              Agrupado por disponibilidade
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div
      className={`bulk-action-bar sticky bottom-2 mt-3 flex flex-wrap items-center gap-2 p-2.5 border rounded-lg shadow-sm transition-colors ${
        hasSelection ? "bg-primary/5 border-primary/30" : "bg-card"
      }`}
    >
      <div className="text-sm font-medium">
        {hasSelection ? `${selection.size} selecionado${selection.size > 1 ? "s" : ""}` : "Nenhum selecionado"}
      </div>

      <div className="flex-1" />

      <button
        className="border rounded px-2.5 py-1 text-sm hover:bg-muted"
        onClick={() => selectAllByFilter()}
      >
        Selecionar tudo (até {SHEET_SELECT_ALL_MAX})
      </button>

      <button
        className="border rounded px-2.5 py-1 text-sm hover:bg-muted disabled:opacity-50"
        disabled={!hasSelection}
        onClick={handleCreateTag}
      >
        Criar e aplicar tag
      </button>

      <button
        className="border rounded px-2.5 py-1 text-sm hover:bg-muted disabled:opacity-50"
        disabled={!hasSelection}
        onClick={() => onExportSelected()}
      >
        Exportar CSV
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-1.5 border rounded px-2.5 py-1 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!hasSelection}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Formato da lista</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onCopyFormatted?.("none")}>
            <div>
              <div className="text-sm">Lista simples</div>
              <div className="text-xs text-muted-foreground">Nome — Telefone (uma por linha)</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopyFormatted?.("cidade")}>
            <div>
              <div className="text-sm">Agrupado por cidade</div>
              <div className="text-xs text-muted-foreground">Cabeçalho por cidade</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopyFormatted?.("tag")}>
            <div>
              <div className="text-sm">Agrupado por tag</div>
              <div className="text-xs text-muted-foreground">Um bloco por tag; &quot;Sem tag&quot; ao final</div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCopyFormatted?.("disponibilidade")}>
            <div>
              <div className="text-sm">Agrupado por disponibilidade</div>
              <div className="text-xs text-muted-foreground">Por dia da semana</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
