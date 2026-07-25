import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { deleteLegalPage, getLegalPage, listLegalPages, upsertLegalPage } from "@/lib/legal-pages.functions";
import { Copy, ExternalLink, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ACCENT_MARKS = /[\u0300-\u036f]/g;

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(ACCENT_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type LegalPageListItem = {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
};

export function LegalPagesTab() {
  const listFn = useServerFn(listLegalPages);
  const getFn = useServerFn(getLegalPage);
  const upsertFn = useServerFn(upsertLegalPage);
  const deleteFn = useServerFn(deleteLegalPage);
  const q = useQuery({ queryKey: ["legal-pages"], queryFn: () => listFn() });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setContent("");
    setSlugTouched(false);
  }

  async function startCreate() {
    resetForm();
    setEditingId("new");
  }

  async function startEdit(id: string) {
    setLoadingEdit(true);
    try {
      const row = await getFn({ data: { id } });
      setEditingId(id);
      setTitle(row.title);
      setSlug(row.slug);
      setContent(row.content);
      setSlugTouched(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar página");
    } finally {
      setLoadingEdit(false);
    }
  }

  async function onSave() {
    if (title.trim().length < 2) {
      toast.error("Informe um título.");
      return;
    }
    const finalSlug = slugify(slug || title);
    if (finalSlug.length < 2) {
      toast.error("Slug inválido.");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editingId && editingId !== "new" ? editingId : undefined,
          title: title.trim(),
          slug: finalSlug,
          content,
        },
      });
      toast.success(editingId === "new" ? "Página criada" : "Página salva");
      resetForm();
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string, pageTitle: string) {
    if (!confirm(`Excluir a página "${pageTitle}"? Links que apontam para ela deixarão de funcionar.`)) return;
    setDeletingId(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("Página excluída");
      if (editingId === id) resetForm();
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  const publicPath = (s: string) => `/termos/${s}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Crie páginas públicas reutilizáveis. Use o caminho <code className="text-foreground">/termos/seu-slug</code> no campo URL de links de perguntas.
        </p>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" /> Nova página
        </button>
      </div>

      {editingId && (
        <div className="border rounded-xl bg-card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {editingId === "new" ? "Nova página" : "Editar página"}
          </h2>
          <div>
            <label className="text-sm font-medium">Título</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Slug (URL)</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/termos/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Conteúdo (texto puro)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="Cole ou digite o texto. Quebras de linha são preservadas."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma página cadastrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {(q.data as LegalPageListItem[]).map((page) => (
            <li key={page.id} className="border rounded-lg bg-card p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{page.title}</p>
                <p className="text-xs text-muted-foreground font-mono">{publicPath(page.slug)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(publicPath(page.slug));
                    toast.success("Caminho copiado");
                  }}
                  className="p-2 hover:bg-muted rounded"
                  title="Copiar caminho"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={publicPath(page.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-muted rounded"
                  title="Abrir página"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => startEdit(page.id)}
                  disabled={loadingEdit}
                  className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(page.id, page.title)}
                  disabled={deletingId === page.id}
                  className="p-2 hover:bg-destructive/10 text-destructive rounded"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
