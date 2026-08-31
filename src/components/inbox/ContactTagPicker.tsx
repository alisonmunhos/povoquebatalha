import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { listTagsForInboxPicker, createContactTagFromInbox } from "@/lib/communication.functions";

export type InboxTagRow = { id: string; nome: string; cor: string | null; categoria: string };

type Props = {
  /** Tags que o contato já tem — ficam de fora da lista. */
  excludeIds: string[];
  /** Chamado quando uma tag já existente é escolhida. */
  onPick: (tag: InboxTagRow) => void;
  /** Chamado depois que uma tag nova é criada e já deve ser aplicada. */
  onCreated: (tag: InboxTagRow) => void;
};

// Combobox pesquisável (Popover+Command) sobre as tags do sistema, com opção
// de criar uma tag nova na hora — mesmo padrão do MessageTemplatePicker.tsx.
export function ContactTagPicker({ excludeIds, onPick, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const listFn = useServerFn(listTagsForInboxPicker);
  const createFn = useServerFn(createContactTagFromInbox);
  const tagsQ = useQuery({
    queryKey: ["inbox-tags-picker"],
    queryFn: () => listFn(),
    enabled: open,
  });

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);
  const options = useMemo(
    () => ((tagsQ.data ?? []) as InboxTagRow[]).filter((t) => !excludeSet.has(t.id)),
    [tagsQ.data, excludeSet],
  );

  const trimmedSearch = search.trim();
  // Checa contra TODAS as tags do sistema (não só as que ainda faltam aplicar) —
  // senão, digitar de novo o nome de uma tag que o contato já tem (fora de
  // `options`, que exclui as já aplicadas) ofereceria "criar" e colidiria com
  // o UNIQUE de tags.nome no banco.
  const hasExactMatch = ((tagsQ.data ?? []) as InboxTagRow[]).some(
    (t) => t.nome.toLowerCase() === trimmedSearch.toLowerCase(),
  );

  async function handleCreate() {
    if (!trimmedSearch || creating) return;
    setCreating(true);
    try {
      const row = await createFn({ data: { nome: trimmedSearch } });
      await queryClient.invalidateQueries({ queryKey: ["inbox-tags-picker"] });
      onCreated(row as InboxTagRow);
      setSearch("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar tag.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
      modal
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground"
        >
          <Plus className="h-3 w-3" /> adicionar tag
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[280px] flex flex-col overflow-hidden max-h-[min(60vh,var(--radix-popover-content-available-height))]"
        align="start"
        collisionPadding={16}
        avoidCollisions
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="flex flex-col max-h-full min-h-0" shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar ou criar tag…"
          />
          <CommandList className="flex-1 min-h-0 max-h-[260px]">
            <CommandEmpty>
              {tagsQ.isLoading ? "Carregando…" : "Nenhuma tag encontrada."}
            </CommandEmpty>
            <CommandGroup>
              {options
                .filter(
                  (t) =>
                    !trimmedSearch || t.nome.toLowerCase().includes(trimmedSearch.toLowerCase()),
                )
                .map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.id}
                    onSelect={() => {
                      onPick(t);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    <TagIcon
                      className="h-3 w-3 mr-2 shrink-0"
                      style={t.cor ? { color: t.cor } : undefined}
                    />
                    <span className="truncate">{t.nome}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
          {trimmedSearch && !hasExactMatch && (
            <div className="shrink-0 border-t p-1">
              <button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creating ? "Criando…" : `Criar tag "${trimmedSearch}"`}
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
