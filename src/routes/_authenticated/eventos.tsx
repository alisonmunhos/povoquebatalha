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
  signEventCoverUpload,
  getEventCoverUrl,
  listEventRsvps,
} from "@/lib/events.functions";
import { slugifyEventTitle } from "@/lib/event-slug";
import { listFormDefinitions } from "@/lib/form-definitions.functions";

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

type RsvpContact = {
  id: string;
  nome: string | null;
  nome_social: string | null;
  phone_e164: string | null;
  phone_raw: string | null;
  cidade: string | null;
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
  const signCoverFn = useServerFn(signEventCoverUpload);
  const coverUrlFn = useServerFn(getEventCoverUrl);
  const rsvpsFn = useServerFn(listEventRsvps);
  const formsFn = useServerFn(listFormDefinitions);
  const formsQ = useQuery({ queryKey: ["form-definitions-picker"], queryFn: () => formsFn() });

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
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postButtonText, setPostButtonText] = useState("");
  const [postButtonUrl, setPostButtonUrl] = useState("");
  const [declineTitle, setDeclineTitle] = useState("");
  const [declineBody, setDeclineBody] = useState("");
  const [declineButtonText, setDeclineButtonText] = useState("");
  const [declineButtonUrl, setDeclineButtonUrl] = useState("");
  const [linkedFormId, setLinkedFormId] = useState("");

  const rsvpsQ = useQuery({
    queryKey: ["event-rsvps", editingId],
    queryFn: () => rsvpsFn({ data: { event_id: editingId as string, status: "confirmed" } }),
    enabled: !!editingId,
  });

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
    setCoverPath(null);
    setCoverMime(null);
    setCoverPreview(null);
    setPostTitle("");
    setPostBody("");
    setPostButtonText("");
    setPostButtonUrl("");
    setDeclineTitle("");
    setDeclineBody("");
    setDeclineButtonText("");
    setDeclineButtonUrl("");
    setLinkedFormId("");
  }

  async function uploadCover(file: File) {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Formato não aceito. Envie PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande. O limite é 8 MB.");
      return;
    }
    setUploadingCover(true);
    try {
      const signed = await signCoverFn({ data: { filename: file.name, contentType: file.type } });
      const res = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Falha ao enviar a imagem.");
      setCoverPath(signed.path);
      setCoverMime(file.type);
      setCoverPreview(URL.createObjectURL(file));
      toast.success("Capa enviada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar a capa.");
    } finally {
      setUploadingCover(false);
    }
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
    const extra = r.event as unknown as {
      cover_path: string | null;
      cover_mime: string | null;
      post_rsvp_title: string | null;
      post_rsvp_body: string | null;
      post_rsvp_button_text: string | null;
      post_rsvp_button_url: string | null;
      post_decline_title: string | null;
      post_decline_body: string | null;
      post_decline_button_text: string | null;
      post_decline_button_url: string | null;
      linked_form_definition_id: string | null;
    };
    setCoverPath(extra.cover_path ?? null);
    setCoverMime(extra.cover_mime ?? null);
    setCoverPreview(null);
    if (extra.cover_path) {
      coverUrlFn({ data: { path: extra.cover_path } })
        .then((c) => setCoverPreview(c.url))
        .catch(() => setCoverPreview(null));
    }
    setPostTitle(extra.post_rsvp_title ?? "");
    setPostBody(extra.post_rsvp_body ?? "");
    setPostButtonText(extra.post_rsvp_button_text ?? "");
    setPostButtonUrl(extra.post_rsvp_button_url ?? "");
    setDeclineTitle(extra.post_decline_title ?? "");
    setDeclineBody(extra.post_decline_body ?? "");
    setDeclineButtonText(extra.post_decline_button_text ?? "");
    setDeclineButtonUrl(extra.post_decline_button_url ?? "");
    setLinkedFormId(extra.linked_form_definition_id ?? "");
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
          cover_path: coverPath,
          cover_mime: coverMime,
          post_rsvp_title: postTitle.trim() || null,
          post_rsvp_body: postBody.trim() || null,
          post_rsvp_button_text: postButtonText.trim() || null,
          post_rsvp_button_url: postButtonUrl.trim() || null,
          post_decline_title: declineTitle.trim() || null,
          post_decline_body: declineBody.trim() || null,
          post_decline_button_text: declineButtonText.trim() || null,
          post_decline_button_url: declineButtonUrl.trim() || null,
          linked_form_definition_id: linkedFormId || null,
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

        <div className="grid gap-3 sm:grid-cols-2 border-t pt-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Imagem de capa (opcional)</label>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              {coverPreview && (
                <img src={coverPreview} alt="Capa do evento" className="h-16 w-28 rounded object-cover border" />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploadingCover}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadCover(f);
                }}
                className="text-xs"
              />
              {coverPath && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverPath(null);
                    setCoverMime(null);
                    setCoverPreview(null);
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  Remover capa
                </button>
              )}
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Formulário usado na página do evento</label>
            <select
              value={linkedFormId}
              onChange={(e) => setLinkedFormId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Sem formulário (só nome e WhatsApp)</option>
              {(formsQ.data ?? [])
                .filter((f) => f.layout_mode === "sectioned")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              A pessoa preenche a primeira seção do formulário e a presença é confirmada na mesma ação. As seções
              seguintes continuam depois, sem repetir nome e WhatsApp.
            </p>
          </div>

          <div className="sm:col-span-2 pt-2 border-t">
            <p className="text-sm font-semibold">Depois de confirmar presença</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="Ex.: Presença confirmada! 🎉"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
            <textarea
              value={postBody}
              onChange={(e) => setPostBody(e.target.value)}
              rows={3}
              placeholder="Ex.: Obrigado(a) por confirmar! Agora, clique abaixo pra completar seu cadastro."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Texto do botão (opcional)</label>
            <input
              value={postButtonText}
              onChange={(e) => setPostButtonText(e.target.value)}
              placeholder="Ex.: Completar meu cadastro"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Link do botão (opcional)</label>
            <input
              value={postButtonUrl}
              onChange={(e) => setPostButtonUrl(e.target.value)}
              placeholder="Deixe em branco pra continuar o cadastro na própria página"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2 pt-2 border-t">
            <p className="text-sm font-semibold">Depois de marcar que não poderá ir</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input
              value={declineTitle}
              onChange={(e) => setDeclineTitle(e.target.value)}
              placeholder="Ex.: Tudo bem, obrigado por avisar!"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Mensagem</label>
            <textarea
              value={declineBody}
              onChange={(e) => setDeclineBody(e.target.value)}
              rows={3}
              placeholder="Ex.: Mesmo não podendo estar lá, você pode continuar com a gente."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Texto do botão (opcional)</label>
            <input
              value={declineButtonText}
              onChange={(e) => setDeclineButtonText(e.target.value)}
              placeholder="Ex.: Quero continuar com vocês"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Link do botão (opcional)</label>
            <input
              value={declineButtonUrl}
              onChange={(e) => setDeclineButtonUrl(e.target.value)}
              placeholder="Deixe em branco pra abrir o formulário na própria página"
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

      {editingId && (
        <section className="border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-sm">
            Quem confirmou presença ({rsvpsQ.data?.rsvps.length ?? 0})
          </div>
          {rsvpsQ.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
          {!rsvpsQ.isLoading && !(rsvpsQ.data?.rsvps.length ?? 0) && (
            <div className="p-4 text-sm text-muted-foreground">Ninguém confirmou presença ainda.</div>
          )}
          <ul className="divide-y">
            {(rsvpsQ.data?.rsvps ?? []).map((r) => {
              const c = (r as { contacts: RsvpContact | null }).contacts;
              return (
                <li key={r.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {c?.nome_social?.trim() || c?.nome || "(sem nome)"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[c?.phone_e164 ?? c?.phone_raw, c?.cidade].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {c?.id && (
                    <Link
                      to="/contatos/$id"
                      params={{ id: c.id }}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Ver ficha
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
