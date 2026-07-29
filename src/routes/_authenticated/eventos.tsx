import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Calendar, ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listEvents,
  getEvent,
  upsertEvent,
  deleteEvent,
  suggestEventSlug,
} from "@/lib/events.functions";
import { slugifyEventTitle } from "@/lib/event-slug";

export const Route = createFileRoute("/_authenticated/eventos")({
  head: () => ({ meta: [{ title: "Eventos — Campanha do Povo que Batalha" }] }),
  component: EventosPage,
});

type EventRow = {
  id: string;
  title: string;
  slug: string;
  starts_at: string;
  ends_at: string | null;
  is_published: boolean;
  location: string | null;
};

function toLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventosPage() {
  const listFn = useServerFn(listEvents);
  const getFn = useServerFn(getEvent);
  const saveFn = useServerFn(upsertEvent);
  const removeFn = useServerFn(deleteEvent);
  const slugFn = useServerFn(suggestEventSlug);

  const listQ = useQuery({ queryKey: ["events-admin"], queryFn: () => listFn() });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ confirmed: number; declined: number } | null>(null);

  const events = (listQ.data?.events ?? []) as EventRow[];

  useEffect(() => {
    if (!title.trim() || slugTouched || editingId) return;
    const t = window.setTimeout(() => {
      void slugFn({ data: { title } }).then((r) => setSlug(r.slug)).catch(() => setSlug(slugifyEventTitle(title)));
    }, 300);
    return () => window.clearTimeout(t);
  }, [title, slugTouched, editingId, slugFn]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setDescription("");
    setLocation("");
    setStartsAt("");
    setEndsAt("");
    setIsPublished(false);
    setStats(null);
  }

  async function openEdit(id: string) {
    const r = await getFn({ data: { id } });
    const e = r.event as EventRow & { description: string | null };
    setEditingId(id);
    setTitle(e.title);
    setSlug(e.slug);
    setSlugTouched(true);
    setDescription(e.description ?? "");
    setLocation(e.location ?? "");
    setStartsAt(toLocalDatetimeValue(e.starts_at));
    setEndsAt(toLocalDatetimeValue(e.ends_at));
    setIsPublished(Boolean(e.is_published));
    setStats(r.stats);
  }

  async function save() {
    if (!title.trim() || !slug.trim() || !startsAt) {
      toast.error("Preencha título, slug e data/hora de início.");
      return;
    }
    setSaving(true);
    try {
      await saveFn({
        data: {
          id: editingId ?? undefined,
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
          is_published: isPublished,
        },
      });
      toast.success(editingId ? "Evento atualizado." : "Evento criado.");
      resetForm();
      await listQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, eventTitle: string) {
    if (!confirm(`Excluir o evento "${eventTitle}"? RSVPs também serão apagados.`)) return;
    try {
      await removeFn({ data: { id } });
      toast.success("Evento excluído.");
      if (editingId === id) resetForm();
      await listQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  const publicUrl = slug.trim() ? `${typeof window !== "undefined" ? window.location.origin : ""}/evento/${slug.trim()}` : "";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" /> Eventos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie eventos com página pública e RSVP. Vincule opcionalmente na tela de sucesso de um formulário.
        </p>
      </header>

      <section className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="font-semibold">{editingId ? "Editar evento" : "Novo evento"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Slug (URL pública)</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
              Publicado
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Início</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Fim (opcional)</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Local</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {stats && (
          <p className="text-xs text-muted-foreground">
            RSVPs: {stats.confirmed} confirmado(s) · {stats.declined} recusou(ram)
          </p>
        )}

        {isPublished && publicUrl && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> {publicUrl}
          </a>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
          {editingId ? (
            <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Cancelar edição
            </button>
          ) : (
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-1 rounded-md border px-4 py-2 text-sm hover:bg-muted">
              <Plus className="h-4 w-4" /> Limpar
            </button>
          )}
        </div>
      </section>

      <section className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold text-sm">Eventos cadastrados</div>
        {listQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando…</div>}
        {events.length === 0 && !listQ.isLoading && (
          <div className="p-6 text-sm text-muted-foreground">Nenhum evento ainda.</div>
        )}
        <ul className="divide-y">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{e.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(e.starts_at).toLocaleString("pt-BR")}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
                <div className="text-xs mt-1">
                  <span className={e.is_published ? "text-emerald-700" : "text-amber-700"}>
                    {e.is_published ? "Publicado" : "Rascunho"}
                  </span>
                  <span className="text-muted-foreground"> · /evento/{e.slug}</span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={() => openEdit(e.id)} className="text-xs text-primary hover:underline">
                  Editar
                </button>
                <Link
                  to="/evento/$slug"
                  params={{ slug: e.slug }}
                  search={{ t: undefined }}
                  target="_blank"
                  className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-0.5"
                >
                  <ExternalLink className="h-3 w-3" /> Abrir
                </Link>
                <button type="button" onClick={() => remove(e.id, e.title)} className="text-xs text-destructive hover:underline inline-flex items-center gap-0.5">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
