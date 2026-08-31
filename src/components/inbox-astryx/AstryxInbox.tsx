import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, getRouteApi } from "@tanstack/react-router";
import { Search, Star, MessageSquare, ExternalLink, AlertTriangle, ArrowLeft, Link2, FileText } from "lucide-react";
import { toast } from "sonner";

import { ChatLayout } from "@astryxdesign/core/Chat";
import { ChatMessageList } from "@astryxdesign/core/Chat";
import { ChatMessage } from "@astryxdesign/core/Chat";
import { ChatMessageBubble } from "@astryxdesign/core/Chat";
import { ChatMessageMetadata } from "@astryxdesign/core/Chat";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { Badge } from "@astryxdesign/core/Badge";
import { EmptyState } from "@astryxdesign/core/EmptyState";

import { supabase } from "@/integrations/supabase/client";
import { sendDirectMessage } from "@/lib/inbox.functions";
import {
  listConversations,
  getConversation,
  markConversationRead,
  searchContactsForNewChat,
} from "@/lib/communication.functions";
import { linkify } from "@/lib/linkify";
import { AstryxProvider } from "./AstryxProvider";
import type { TemplateButton } from "@/lib/whatsapp-templates.functions";

const routeApi = getRouteApi("/_authenticated/comunicacao/inbox-astryx");

// ---------------------------------------------------------------- utilitários
// Mesmas regras do Inbox atual (LID, erro de janela de 24h, datas).
function isLidPhone(v?: string | null): boolean {
  return Boolean(v && /@lid$/i.test(v));
}
function displayPhone(v?: string | null): string {
  if (!v) return "—";
  if (isLidPhone(v)) return "Contato anônimo (WhatsApp)";
  return v;
}
function describeSendError(erro?: string | null): string {
  const raw = (erro ?? "").trim();
  if (!raw) return " · erro";
  const low = raw.toLowerCase();
  if (low.includes("131047") || low.includes("re-engagement") || low.includes("reengagement")) {
    return " · fora da janela de 24h — peça pra ele responder, ou use um template";
  }
  return ` · ${raw}`;
}
function fmtDate(iso: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
function fmtRel(iso: string | null) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return `${d}d`;
  }
}

type Filter = "all" | "mine" | "unread" | "flagged" | "resolved" | "in_service" | "unlinked" | "with_error" | "opt_out";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "mine", label: "Minhas" },
  { key: "unread", label: "Não lidas" },
  { key: "flagged", label: "Sinalizadas" },
  { key: "in_service", label: "Em atendimento" },
  { key: "unlinked", label: "Não vinculadas" },
  { key: "with_error", label: "Com erro" },
  { key: "opt_out", label: "Opt-out" },
  { key: "resolved", label: "Resolvidas" },
];

type Msg = {
  id: string;
  kind: "in" | "out";
  text: string;
  at: string;
  meta?: string;
  media_path?: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  media_filename?: string | null;
  buttons?: TemplateButton[];
};

/** Piloto visual do Inbox usando os componentes de Chat do Astryx. */
export function AstryxInbox() {
  return (
    <AstryxProvider>
      <InboxPilot />
    </AstryxProvider>
  );
}

function InboxPilot() {
  const qc = useQueryClient();
  const { contact: contactParam } = routeApi.useSearch();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(contactParam || null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "thread">(contactParam ? "thread" : "list");

  const listFn = useServerFn(listConversations);
  const convFn = useServerFn(getConversation);
  const readFn = useServerFn(markConversationRead);
  const sendFn = useServerFn(sendDirectMessage);
  const searchNewFn = useServerFn(searchContactsForNewChat);

  // ?contact=<id> vindo de "Abrir chat" na tela de Contatos.
  useEffect(() => {
    if (contactParam) {
      setSelectedContactId(contactParam);
      setSelectedConvId(null);
      setMobilePane("thread");
    }
  }, [contactParam]);

  const listQ = useQuery({
    queryKey: ["comm-conv-list", filter, search],
    queryFn: () => listFn({ data: { filter, search: search || undefined } }),
    refetchInterval: 15000,
  });
  const list = listQ.data?.list ?? [];

  const searchNewQ = useQuery({
    queryKey: ["comm-search-new", search],
    queryFn: () => searchNewFn({ data: { q: search } }),
    enabled: search.trim().length >= 2,
  });

  const selected = useMemo(
    () => list.find((c) => (selectedConvId ? c.id === selectedConvId : c.contact_id === selectedContactId)) ?? null,
    [list, selectedContactId, selectedConvId],
  );

  const convKey = selectedContactId ?? `conv:${selectedConvId ?? ""}`;
  const convQ = useQuery({
    queryKey: ["comm-conv", convKey],
    queryFn: () =>
      convFn({
        data: selectedContactId ? { contact_id: selectedContactId } : { conversation_id: selectedConvId! },
      }),
    enabled: Boolean(selectedContactId || selectedConvId),
    refetchInterval: 15000,
  });

  // Realtime igual ao Inbox atual.
  useEffect(() => {
    const ch = supabase
      .channel("conv-live-astryx")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
        qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbound_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, convKey]);

  const readMut = useMutation({
    mutationFn: (contact_id: string) => readFn({ data: { contact_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
    },
  });

  const sendMut = useMutation({
    mutationFn: (payload: { contact_id: string; message: string }) =>
      sendFn({ data: { ...payload, origem: "inbox" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      toast.success("Mensagem enviada");
    },
    onError: (e, vars) => {
      setReply((prev) => (prev.length > 0 ? prev : (vars?.message ?? "")));
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    },
  });

  const contact = convQ.data?.contact;
  const conv = convQ.data?.conversation;
  const canSend = Boolean(contact && !contact.opt_out_at && (contact.phone_e164 || contact.phone_whatsapp_candidate));

  const active = selected
    ? {
        nome: selected.nome,
        phone: selected.phone,
        cidade: selected.cidade,
        uf: selected.uf,
        opt_out: selected.opt_out,
        contact_id: selected.contact_id,
      }
    : contact
      ? {
          nome: contact.nome,
          phone: contact.phone_e164 ?? contact.phone_whatsapp_candidate,
          cidade: contact.cidade,
          uf: contact.uf,
          opt_out: Boolean(contact.opt_out_at),
          contact_id: contact.id,
        }
      : null;

  const timeline = useMemo<Msg[]>(() => {
    const t: Msg[] = [];
    for (const m of convQ.data?.inbound ?? []) {
      const inb = m as {
        id: string;
        conteudo: string | null;
        received_at: string;
        media_url?: string | null;
        media_mime?: string | null;
        media_filename?: string | null;
      };
      t.push({
        id: `in-${inb.id}`,
        kind: "in",
        text: inb.conteudo ?? "",
        at: inb.received_at,
        media_url: inb.media_url ?? null,
        media_mime: inb.media_mime ?? null,
        media_filename: inb.media_filename ?? null,
      });
    }
    for (const m of convQ.data?.direct ?? []) {
      t.push({
        id: `d-${m.id}`,
        kind: "out",
        text: (m as { conteudo?: string }).conteudo ?? "",
        at: m.created_at as string,
        meta: `${m.sender_name ?? "Você"}${
          m.status === "erro" ? describeSendError((m as { erro?: string | null }).erro) : ""
        }${m.origem !== "inbox" ? ` · ${m.origem}` : ""}`,
        media_path: (m as { media_path?: string | null }).media_path ?? null,
        media_mime: (m as { media_mime?: string | null }).media_mime ?? null,
        media_filename: (m as { media_filename?: string | null }).media_filename ?? null,
      });
    }
    for (const m of convQ.data?.campaign ?? []) {
      t.push({
        id: `c-${m.id}`,
        kind: "out",
        text: m.rendered_message ?? "",
        at: m.sent_at ?? "",
        meta: `campanha · ${m.campaign_name ?? ""}`,
        buttons: m.buttons,
      });
    }
    return t.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [convQ.data]);

  function openConversation(contactId: string | null, convId: string | null, unread: number) {
    setSelectedContactId(contactId);
    setSelectedConvId(contactId ? null : convId);
    setMobilePane("thread");
    if (contactId && unread > 0) readMut.mutate(contactId);
  }

  function submitReply(value: string) {
    if (!selectedContactId || !value.trim()) return;
    setReply("");
    sendMut.mutate({ contact_id: selectedContactId, message: value });
  }

  const composerStatus = !canSend
    ? {
        type: "warning" as const,
        message: contact?.opt_out_at
          ? "Contato optou por sair (opt-out). Envio bloqueado."
          : conv && !conv.contact_id
            ? "Vincule esta conversa a um contato antes de responder."
            : "Contato sem WhatsApp válido.",
      }
    : undefined;

  return (
    <div data-astryx-theme="neutral" className="flex h-full min-h-0">
      {/* ESQUERDA: lista de conversas (mesma lógica do Inbox atual) */}
      <div
        className={`${mobilePane === "list" ? "flex" : "hidden"} md:flex w-full md:w-80 lg:w-96 flex-col border-r bg-background`}
      >
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone…"
              className="w-full text-sm pl-8 pr-2 py-2 rounded-md border border-input bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listQ.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
          {list.length === 0 && !listQ.isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa neste filtro.</div>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.contact_id, c.id, c.unread)}
              className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/40 transition-colors ${
                (selectedContactId ? c.contact_id === selectedContactId : selectedConvId === c.id) ? "bg-muted/60" : ""
              }`}
            >
              <div className="flex justify-between items-baseline gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {c.flagged && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                  <span className="font-medium text-sm truncate">
                    {c.nome ?? (isLidPhone(c.phone) ? "Sem contato vinculado" : (c.phone ?? "Sem nome"))}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{fmtRel(c.last_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                {c.unread > 0 && (
                  <span className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-full text-[10px] px-1.5 min-w-[1rem] font-semibold">
                    {c.unread}
                  </span>
                )}
                {c.last_dir === "out" && <span className="text-muted-foreground/60">↩</span>}
                <span className="truncate">{c.last_preview || "(sem prévia)"}</span>
              </div>
            </button>
          ))}

          {search.trim().length >= 2 && (searchNewQ.data?.length ?? 0) > 0 && (
            <div className="border-t bg-muted/10">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Iniciar nova conversa
              </div>
              {(searchNewQ.data ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id, null, 0)}
                  className="w-full text-left px-3 py-2 border-b hover:bg-background/50"
                >
                  <div className="text-sm font-medium truncate">{c.nome ?? "Sem nome"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.phone}
                    {c.cidade ? ` · ${c.cidade}/${c.uf ?? ""}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CENTRO: thread com os componentes de Chat do Astryx */}
      <div className={`${mobilePane === "thread" ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
        {!active ? (
          <div className="flex-1 grid place-items-center p-8">
            <EmptyState
              icon={<MessageSquare />}
              title={selectedContactId ? "Carregando conversa…" : "Nenhuma conversa aberta"}
              description="Escolha uma conversa na lista ao lado para ver o histórico e responder."
            />
          </div>
        ) : (
          <>
            <div className="border-b p-3 flex items-center gap-2 bg-background">
              <button className="md:hidden" onClick={() => setMobilePane("list")} aria-label="Voltar para a lista">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {active.nome ?? (isLidPhone(active.phone) ? "Sem contato vinculado" : (active.phone ?? "Sem nome"))}
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                  <span className={isLidPhone(active.phone) ? "font-mono text-[10px]" : ""}>
                    {displayPhone(active.phone)}
                  </span>
                  {active.cidade && (
                    <span>
                      · {active.cidade}/{active.uf ?? ""}
                    </span>
                  )}
                  {active.opt_out && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> opt-out
                    </span>
                  )}
                </div>
              </div>
              {active.contact_id && (
                <Link
                  to="/contatos/$id"
                  params={{ id: active.contact_id }}
                  target="_blank"
                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0"
                >
                  <ExternalLink className="h-3 w-3" /> Ficha
                </Link>
              )}
            </div>

            <div className="flex-1 min-h-0">
              <ChatLayout
                density="balanced"
                composer={
                  <ChatComposer
                    value={reply}
                    onChange={setReply}
                    onSubmit={submitReply}
                    isDisabled={!canSend || sendMut.isPending}
                    placeholder="Escreva uma mensagem…"
                    status={composerStatus}
                  />
                }
                emptyState={
                  convQ.isLoading ? undefined : (
                    <EmptyState title="Sem mensagens ainda" description="Envie a primeira mensagem desta conversa." />
                  )
                }
              >
                <ChatMessageList density="balanced">
                  {timeline.map((m) => (
                    <ChatMessage key={m.id} sender={m.kind === "out" ? "user" : "assistant"}>
                      <ChatMessageBubble
                        metadata={
                          <ChatMessageMetadata timestamp={`${fmtDate(m.at)}${m.meta ? ` · ${m.meta}` : ""}`} />
                        }
                      >
                        {m.media_path && (
                          <SignedMedia
                            path={m.media_path}
                            mime={m.media_mime ?? ""}
                            filename={m.media_filename ?? "arquivo"}
                          />
                        )}
                        {m.media_url && (
                          <InboundMedia
                            url={m.media_url}
                            mime={m.media_mime ?? ""}
                            filename={m.media_filename ?? "arquivo"}
                          />
                        )}
                        {m.text && <span className="whitespace-pre-wrap break-words">{linkify(m.text)}</span>}
                        {m.buttons && m.buttons.length > 0 && (
                          <span className="flex flex-wrap gap-1.5 mt-1.5">
                            {m.buttons.map((b, idx) => (
                              <Badge
                                key={idx}
                                label={b.text}
                                variant="neutral"
                                icon={b.type === "URL" ? <Link2 /> : undefined}
                              />
                            ))}
                          </span>
                        )}
                      </ChatMessageBubble>
                    </ChatMessage>
                  ))}
                </ChatMessageList>
              </ChatLayout>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Anexo enviado por nós: URL assinada temporária no bucket campaign-media.
function SignedMedia({ path, mime, filename }: { path: string; mime: string; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.storage
      .from("campaign-media")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data?.signedUrl) setErr(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  if (err) return <span className="block text-xs opacity-70 mb-1">[anexo indisponível]</span>;
  if (!url) return <span className="block text-xs opacity-70 mb-1">carregando anexo…</span>;
  return <MediaBody url={url} mime={mime} filename={filename} />;
}

function InboundMedia({ url, mime, filename }: { url: string; mime: string; filename: string }) {
  return <MediaBody url={url} mime={mime} filename={filename} />;
}

function MediaBody({ url, mime, filename }: { url: string; mime: string; filename: string }) {
  if (mime.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-1">
        <img src={url} alt={filename} className="max-h-64 rounded" />
      </a>
    );
  }
  if (mime.startsWith("audio/")) {
    return <audio controls src={url} className="mb-1 max-w-full" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 text-xs underline underline-offset-2"
    >
      <FileText className="h-4 w-4" /> {filename}
    </a>
  );
}
