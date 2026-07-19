import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listTagsWithUsage } from "@/lib/tags.functions";
import { bulkApplyTag } from "@/lib/crm-bulk.functions";
import { createTag } from "@/lib/contacts.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  defaultTagName?: string;
  onApplied: () => void;
};

// Reaproveita 100% da lógica de tags já usada na Gestão da Base
// (bulkApplyTag/createTag/listTagsWithUsage) — a tag cai direto no cadastro
// principal do contato e já fica filtrável lá, sem precisar de nada novo.
export function ApplyTagModal({
  open,
  onOpenChange,
  contactIds,
  defaultTagName,
  onApplied,
}: Props) {
  const tagsFn = useServerFn(listTagsWithUsage);
  const bulkTagFn = useServerFn(bulkApplyTag);
  const createTagFn = useServerFn(createTag);
  const [tagId, setTagId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState(defaultTagName ?? "");
  const [saving, setSaving] = useState(false);

  const tagsQ = useQuery({ queryKey: ["tags-with-usage"], queryFn: () => tagsFn(), enabled: open });

  useEffect(() => {
    if (open) {
      setTagId("");
      setCreating(false);
      setNewTagName(defaultTagName ?? "");
    }
  }, [open, defaultTagName]);

  async function doCreateTag() {
    const nome = newTagName.trim();
    if (!nome) return toast.error("Digite um nome para a tag");
    try {
      const row = await createTagFn({ data: { nome } });
      await tagsQ.refetch();
      setTagId(row.id);
      setCreating(false);
      toast.success(`Tag "${row.nome}" criada — pronta para aplicar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar tag");
    }
  }

  async function onConfirm() {
    if (!tagId) return toast.error("Escolha ou crie uma tag.");
    setSaving(true);
    try {
      await bulkTagFn({ data: { ids: contactIds, tag_id: tagId, add: true } });
      toast.success(`Tag aplicada a ${contactIds.length} contato(s).`);
      onOpenChange(false);
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar tag.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar tag aos contatos selecionados</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {contactIds.length} contato(s) selecionado(s). A tag cai direto no cadastro do contato
            na Gestão da Base — depois dá pra filtrar por ela pra não mandar a mesma mensagem de
            novo.
          </p>
          {creating ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nome da nova tag"
              />
              <Button size="sm" onClick={doCreateTag}>
                Criar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div>
              <Label className="text-xs font-medium">Tag</Label>
              <select
                value={tagId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setCreating(true);
                    return;
                  }
                  setTagId(e.target.value);
                }}
                className="mt-1 w-full text-sm h-9 rounded-md border px-2 bg-background"
              >
                <option value="">— escolher tag —</option>
                <option value="__new__">+ Criar nova tag…</option>
                {(tagsQ.data?.tags ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={saving || !tagId}>
            {saving ? "Aplicando…" : "Aplicar tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
