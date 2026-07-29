import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, CheckCircle2, Loader2, MapPin, XCircle } from "lucide-react";
import { PublicPageLayout } from "@/components/PublicPageLayout";
import { PublicFormRenderer } from "@/components/PublicFormRenderer";

export const Route = createFileRoute("/evento/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — Evento` }],
  }),
  ssr: false,
  component: EventoPublicPage,
});

type EventData = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  cover_url?: string | null;
  post_rsvp_title?: string | null;
  post_rsvp_button_text?: string | null;
  post_rsvp_button_url?: string | null;
};

type LinkedForm = { slug: string; start_section_id: string | null };

type PageState =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ready";
      event: EventData;
      form: LinkedForm | null;
      contact: { id: string; nome: string } | null;
      rsvp_status: "confirmed" | "declined" | null;
    };

function formatWhen(starts: string, ends: string | null) {
  const start = new Date(starts);
  const end = ends ? new Date(ends) : null;
  const date = start.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const endTime = end ? end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  return { date, time: endTime ? `${time} – ${endTime}` : time };
}

function EventoPublicPage() {
  const { slug } = Route.useParams();
  const { t: tokenFromUrl } = useSearch({ from: "/evento/$slug" });
  const [page, setPage] = useState<PageState>({ status: "loading" });
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [contactToken, setContactToken] = useState<string | undefined>(tokenFromUrl);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setErr(null);
    const qs = contactToken
      ? `?t=${encodeURIComponent(contactToken)}`
      : tokenFromUrl
        ? `?t=${encodeURIComponent(tokenFromUrl)}`
        : "";
    const res = await fetch(`/api/public/events/${encodeURIComponent(slug)}${qs}`);
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setPage({ status: "missing" });
      return;
    }
    setPage({
      status: "ready",
      event: json.event as EventData,
      form: (json.form as LinkedForm | null) ?? null,
      contact: json.contact ?? null,
      rsvp_status: json.rsvp_status ?? null,
    });
    if (json.contact?.nome) setNome(json.contact.nome);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tokenFromUrl, contactToken]);

  /** Fluxo simples: recusa, e confirmação de eventos sem formulário vinculado. */
  async function submitRsvp(status: "confirmed" | "declined") {
    if (page.status !== "ready") return;
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { status, hp: "" };
      if (status === "confirmed") body.consentimento_whatsapp = consentWhatsapp;
      if (page.contact || contactToken || tokenFromUrl) {
        body.contact_token = contactToken ?? tokenFromUrl;
      } else {
        body.nome = nome.trim();
        body.phone = phone.trim();
      }
      const res = await fetch(`/api/public/events/${encodeURIComponent(slug)}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erro ao registrar resposta.");
      if (json.contact_token) setContactToken(json.contact_token);
      setShowForm(false);
      setPage({
        status: "ready",
        event: page.event,
        form: page.form,
        contact: { id: page.contact?.id ?? "known", nome: json.contact_name ?? nome },
        rsvp_status: status,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro.");
    } finally {
      setBusy(false);
    }
  }

  const icsUrl = `/api/public/events/${encodeURIComponent(slug)}/ics`;

  return (
    <PublicPageLayout>
      {page.status === "loading" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando evento…
        </div>
      )}

      {page.status === "missing" && (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Evento não encontrado</h1>
          <p className="text-sm text-muted-foreground">Este evento não existe ou não está publicado.</p>
          <Link to="/" className="text-sm text-primary hover:underline">Voltar ao início</Link>
        </div>
      )}

      {page.status === "ready" && (
        <article className="space-y-5">
          {page.event.cover_url && (
            <img
              src={page.event.cover_url}
              alt={`Imagem do evento ${page.event.title}`}
              className="w-full rounded-xl border object-cover max-h-72"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{page.event.title}</h1>
            {(() => {
              const when = formatWhen(page.event.starts_at, page.event.ends_at);
              return (
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span className="capitalize">{when.date}</span>
                  </div>
                  <div className="pl-6">{when.time}</div>
                  {page.event.location && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{page.event.location}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {page.event.description && (
            <div className="bg-card border rounded-xl p-5 text-sm whitespace-pre-wrap leading-relaxed">
              {page.event.description}
            </div>
          )}

          <a href={icsUrl} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
            <Calendar className="h-4 w-4" /> Adicionar à agenda (.ics)
          </a>

          {/* ===== Com formulário vinculado: o motor de seções cuida de tudo ===== */}
          {page.form ? (
            <section className="space-y-4">
              {page.rsvp_status === "confirmed" && !showForm && (
                <div className="bg-card border rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 text-sm">
                    <CheckCircle2 className="h-5 w-5" />
                    {page.event.post_rsvp_title ?? "Presença confirmada. Até lá!"}
                  </div>
                  {page.event.post_rsvp_button_url && (
                    <a
                      href={page.event.post_rsvp_button_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90"
                    >
                      {page.event.post_rsvp_button_text ?? "Saiba mais"}
                    </a>
                  )}
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitRsvp("declined")}
                      className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    >
                      Mudar para: não vou
                    </button>
                  </div>
                </div>
              )}

              {page.rsvp_status === "declined" && !showForm && (
                <div className="bg-card border rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <XCircle className="h-5 w-5" /> Você informou que não poderá ir.
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
                  >
                    Mudar para: vou sim
                  </button>
                </div>
              )}

              {(page.rsvp_status == null || showForm) && (
                <>
                  <PublicFormRenderer
                    slug={page.form.slug}
                    startSectionId={page.form.start_section_id ?? undefined}
                    recadToken={contactToken ?? tokenFromUrl}
                    eventSlug={slug}
                  />
                  <div className="text-center">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitRsvp("declined")}
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                    >
                      Não poderei ir
                    </button>
                  </div>
                </>
              )}

              {err && <p className="text-sm text-destructive">{err}</p>}
            </section>
          ) : (
            /* ===== Sem formulário vinculado: fluxo simples de sempre ===== */
            <section className="bg-card border rounded-xl p-5 space-y-4">
              <h2 className="font-semibold">Sua presença</h2>

              {page.rsvp_status === "confirmed" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 text-sm">
                    <CheckCircle2 className="h-5 w-5" />
                    {page.event.post_rsvp_title ?? "Presença confirmada. Até lá!"}
                  </div>
                  {page.event.post_rsvp_button_url && (
                    <a
                      href={page.event.post_rsvp_button_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90"
                    >
                      {page.event.post_rsvp_button_text ?? "Saiba mais"}
                    </a>
                  )}
                </div>
              )}
              {page.rsvp_status === "declined" && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <XCircle className="h-5 w-5" /> Você informou que não poderá ir.
                </div>
              )}

              {!page.contact && !contactToken && !tokenFromUrl && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Para confirmar, informe seu nome e WhatsApp:</p>
                  <div>
                    <label className="text-xs font-medium">Nome</label>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">WhatsApp</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(51) 99999-9999"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {page.rsvp_status !== "confirmed" && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentWhatsapp}
                    onChange={(e) => setConsentWhatsapp(e.target.checked)}
                    className="mt-0.5"
                  />
                  Autorizo receber mensagens no WhatsApp sobre este evento e outras atividades.
                </label>
              )}

              {page.rsvp_status == null && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={busy || !consentWhatsapp}
                    onClick={() => submitRsvp("confirmed")}
                    className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy ? "Salvando…" : "Confirmar presença"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submitRsvp("declined")}
                    className="flex-1 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Não poderei ir
                  </button>
                </div>
              )}

              {page.rsvp_status != null && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={busy || (page.rsvp_status !== "confirmed" && !consentWhatsapp)}
                    onClick={() => submitRsvp(page.rsvp_status === "confirmed" ? "declined" : "confirmed")}
                    className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    {page.rsvp_status === "confirmed" ? "Mudar para: não vou" : "Mudar para: vou sim"}
                  </button>
                </div>
              )}

              {err && <p className="text-sm text-destructive">{err}</p>}
            </section>
          )}
        </article>
      )}
    </PublicPageLayout>
  );
}
