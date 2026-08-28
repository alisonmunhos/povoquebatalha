import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Plus, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { listMessageTemplates, upsertMessageTemplate } from "@/lib/messages.functions";
import {
  MessageComposer,
  emptyComposerValue,
  type ComposerValue,
} from "@/components/MessageComposer";

// Reaproveita o formato de linha usado em mensagens.tsx — mantido local aqui
// pra não criar dependência entre os dois arquivos por um tipo só.
export type MessageTemplateRow = {
  id: string;
  kind: "system" | "quick_reply";
  event_key: string | null;
  title: string;
  category: string | null;
  body: string;
  link: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_filename: string | null;
  buttons: ComposerValue["buttons"];
  active: boolean;
};

const KIND_LABEL: Record<"system" | "quick_reply", string> = {
  system: "Mensagens do sistema",
  quick_reply: "Respostas prontas",
};

type Props = {
  /** message_templates.id selecionado (ou null). */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Quais kinds aparecem na lista. Default: os dois. */
  kinds?: Array<"system" | "quick_reply">;
  /** Mostra a opção "+ Criar nova mensagem". Default true. */
  allowCreate?: boolean;
  /** kind atribuído às mensagens criadas por este picker. Default "quick_reply" —
   * nunca "system" por padrão, pra nunca colidir com o índice único de event_key
   * (o dialog de criação não expõe event_key nem kind ao usuário). */
  createKind?: "system" | "quick_reply";
  placeholder?: string;
  className?: string;
  /** Chamado com a linha completa (não só o id) quando uma mensagem é escolhida —
   * útil pra telas que precisam do corpo/título pra copiar em outro lugar (ex.:
   * pré-preencher um template Meta a partir de uma mensagem existente). */
  onSelectRow?: (row: MessageTemplateRow) => void;
};

export function MessageTemplatePicker({
  value,
  onChange,
  kinds = ["system", "quick_reply"],
  allowCreate = true,
  createKind = "quick_reply",
  placeholder = "Escolher mensagem…",
  className,
  onSelectRow,
}: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const listFn = useServerFn(listMessageTemplates);
  const templatesQ = useQuery({ queryKey: ["message-templates"], queryFn: () => listFn() });

  const options = useMemo(
    () =>
      ((templatesQ.data ?? []) as unknown as MessageTemplateRow[]).filter(
        (t) => t.active && kinds.includes(t.kind),
      ),
    [templatesQ.data, kinds],
  );
  const grouped = useMemo(() => {
    const byKind = new Map<"system" | "quick_reply", MessageTemplateRow[]>();
    for (const k of kinds) byKind.set(k, []);
    for (const t of options) byKind.get(t.kind)?.push(t);
    return [...byKind.entries()].filter(([, rows]) => rows.length > 0);
  }, [options, kinds]);

  const selected = options.find((t) => t.id === value) ?? null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm text-left",
              className,
            )}
          >
            <span className="truncate">
              {selected ? (
                selected.title
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              {selected && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Limpar"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[360px] flex flex-col overflow-hidden max-h-[min(70vh,var(--radix-popover-content-available-height))]"
          align="start"
          collisionPadding={16}
          avoidCollisions
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command className="flex flex-col max-h-full min-h-0">
            <CommandInput ref={inputRef} placeholder="Buscar mensagem…" />
            <CommandList className="flex-1 min-h-0 max-h-[320px]">
              <CommandEmpty>
                {templatesQ.isLoading ? "Carregando…" : "Nenhuma mensagem encontrada."}
              </CommandEmpty>
              {grouped.map(([kind, rows]) => (
                <CommandGroup key={kind} heading={kinds.length > 1 ? KIND_LABEL[kind] : undefined}>
                  {rows.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={`${t.title} ${t.body} ${t.event_key ?? ""}`}
                      onSelect={() => {
                        onChange(t.id === value ? null : t.id);
                        onSelectRow?.(t);
                        setOpen(false);
                      }}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="text-sm font-medium truncate w-full">{t.title}</span>
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {t.body}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            {allowCreate && (
              <div className="shrink-0 border-t p-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus className="h-4 w-4" /> Criar nova mensagem
                </button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {allowCreate && (
        <CreateMessageDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          createKind={createKind}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ["message-templates"] });
            onChange(id);
          }}
        />
      )}
    </>
  );
}

function CreateMessageDialog({
  open,
  onOpenChange,
  createKind,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  createKind: "system" | "quick_reply";
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [composer, setComposer] = useState<ComposerValue>(emptyComposerValue());
  const [saving, setSaving] = useState(false);
  const saveFn = useServerFn(upsertMessageTemplate);

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Dê um título pra essa mensagem.");
      return;
    }
    if (!composer.body.trim()) {
      toast.error("Escreva o corpo da mensagem.");
      return;
    }
    setSaving(true);
    try {
      const row = await saveFn({
        data: {
          kind: createKind,
          event_key: null,
          shortcut: null,
          title: title.trim(),
          category: category.trim() || null,
          body: composer.body,
          variables: [],
          link: composer.link_url,
          link_title: composer.link_title,
          link_description: composer.link_description,
          link_image: composer.link_image,
          media_path: composer.media_path,
          media_mime: composer.media_mime,
          media_filename: composer.media_filename,
          buttons: composer.buttons ?? [],
          active: true,
        },
      });
      toast.success("Mensagem criada.");
      setTitle("");
      setCategory("");
      setComposer(emptyComposerValue());
      onOpenChange(false);
      onCreated(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar mensagem.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar nova mensagem</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-msg-title">Título</Label>
            <Input
              id="new-msg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome interno pra achar essa mensagem depois"
            />
          </div>
          <div>
            <Label htmlFor="new-msg-category">Categoria (opcional)</Label>
            <Input
              id="new-msg-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex.: boas_vindas, mobilizacao_rua…"
            />
          </div>
          <MessageComposer value={composer} onChange={setComposer} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar mensagem"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
