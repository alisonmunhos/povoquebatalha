import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Search, Send, Loader2, Star, StarOff, CheckCircle2, RotateCcw, Paperclip,
  MessageSquare, ExternalLink, AlertTriangle, UserPlus, ArrowLeft, MoreVertical,
  Flag, ClipboardList, StickyNote, Clock, X, PanelRightClose, PanelRightOpen, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { sendDirectMessage, listQuickReplies } from "@/lib/inbox.functions";
import { signCampaignMediaUpload } from "@/lib/campaigns.functions";
import {
  listConversations, getConversation, markConversationRead, assignConversation,
  setConversationStatus, toggleConversationFlag, addConversationNote,
  listCommunicationStaff, searchContactsForNewChat,
} from "@/lib/communication.functions";

type Filter =
  | "all" | "mine" | "unread" | "flagged" | "resolved"
  | "in_service" | "unlinked" | "with_error" | "opt_out";

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

export function CommunicationInbox() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [note, setNote] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "thread" | "info">("list");
  const [infoOpen, setInfoOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem("inbox.infoOpen");
    if (v === null) return window.innerWidth >= 1024;
    return v === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("inbox.infoOpen", infoOpen ? "1" : "0");
    }
  }, [infoOpen]);

  // Anexo pendente (upload feito, aguardando envio)
  const [attachment, setAttachment] = useState<{ path: string; filename: string; mime: string; previewUrl?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const listFn = useServerFn(listConversations);
  const convFn = useServerFn(getConversation);
  const readFn = useServerFn(markConversationRead);
  const sendFn = useServerFn(sendDirectMessage);
  const tplsFn = useServerFn(listQuickReplies);
  const assignFn = useServerFn(assignConversation);
  const statusFn = useServerFn(setConversationStatus);
  const flagFn = useServerFn(toggleConversationFlag);
  const noteFn = useServerFn(addConversationNote);
  const staffFn = useServerFn(listCommunicationStaff);
  const searchNewFn = useServerFn(searchContactsForNewChat);
  const signFn = useServerFn(signCampaignMediaUpload);

  const listQ = useQuery({
    queryKey: ["comm-conv-list", filter, search],
    queryFn: () => listFn({ data: { filter, search: search || undefined } }),
    refetchInterval: 15000,
  });

  const list = listQ.data ?? [];
  const selected = useMemo(
    () => list.find((c) => (selectedConvId ? c.id === selectedConvId : c.contact_id === selectedContactId)) ?? null,
    [list, selectedContactId, selectedConvId],
  );

  const searchNewQ = useQuery({
    queryKey: ["comm-search-new", search],
    queryFn: () => searchNewFn({ data: { q: search } }),
    enabled: search.trim().length >= 2,
  });

  const convKey = selectedContactId ?? `conv:${selectedConvId ?? ""}`;
  const convQ = useQuery({
    queryKey: ["comm-conv", convKey],
    queryFn: () => convFn({
      data: selectedContactId
        ? { contact_id: selectedContactId }
        : { conversation_id: selectedConvId! },
    }),
    enabled: Boolean(selectedContactId || selectedConvId),
    refetchInterval: 15000,
  });

  const tplsQ = useQuery({ queryKey: ["comm-tpls"], queryFn: () => tplsFn() });
  const staffQ = useQuery({ queryKey: ["comm-staff"], queryFn: () => staffFn() });

  // Realtime: refresh list quando conversas mudam
  useEffect(() => {
    const ch = supabase
      .channel("conv-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
        qc.invalidateQueries({ queryKey: ["comm-badge"] });
        qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbound_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, selectedContactId, selectedConvId, convKey]);

  const readMut = useMutation({
    mutationFn: (contact_id: string) => readFn({ data: { contact_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
    },
  });

  const sendMut = useMutation({
    mutationFn: (payload: {
      contact_id: string; message: string;
      media_path?: string | null; media_mime?: string | null; media_filename?: string | null;
    }) => sendFn({ data: { ...payload, origem: "inbox" } }),
    onSuccess: () => {
      setReply("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      toast.success("Mensagem enviada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  const assignMut = useMutation({
    mutationFn: (v: { conversation_id: string; assigned_to: string | null }) => assignFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
      toast.success("Atribuição atualizada");
    },
  });

  const statusMut = useMutation({
    mutationFn: (v: { conversation_id: string; status: "aberta" | "aguardando" | "resolvida" }) => statusFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      toast.success("Status atualizado");
    },
  });

  const flagMut = useMutation({
    mutationFn: (v: { conversation_id: string; flagged: boolean }) => flagFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm-conv-list"] }),
  });

  const noteMut = useMutation({
    mutationFn: (v: { conversation_id: string; body: string; mention_user_id?: string }) => noteFn({ data: v }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      toast.success("Nota adicionada");
    },
  });

  function openConversation(contactId: string | null, convId: string | null, unread: number) {
    setSelectedContactId(contactId);
    setSelectedConvId(contactId ? null : convId);
    setMobilePane("thread");
    if (contactId && unread > 0) readMut.mutate(contactId);
  }

  function submitReply() {
    if (!selectedContactId) return;
    if (!reply.trim() && !attachment) return;
    sendMut.mutate({
      contact_id: selectedContactId,
      message: reply,
      media_path: attachment?.path ?? null,
      media_mime: attachment?.mime ?? null,
      media_filename: attachment?.filename ?? null,
    });
  }

  function handleSendKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitReply();
    }
  }

  async function onPickFile(f: File | null) {
    if (!f) return;
    const okTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];
    if (!okTypes.includes(f.type)) { toast.error("Envie PNG, JPG, WEBP ou PDF."); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error("Máx. 15MB."); return; }
    setUploading(true);
    try {
      const s = await signFn({ data: { filename: f.name, contentType: f.type } });
      const up = await supabase.storage.from("campaign-media").uploadToSignedUrl(s.path, s.token, f, {
        contentType: f.type, upsert: true,
      });
      if (up.error) throw up.error;
      const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      setAttachment({ path: s.path, filename: s.filename, mime: f.type, previewUrl });
      toast.success("Anexo pronto — clique enviar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao anexar");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearAttachment() {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const contact = convQ.data?.contact;
  const conv = convQ.data?.conversation;
  const canSend = Boolean(contact && !contact.opt_out_at && (contact.phone_e164 || contact.phone_whatsapp_candidate));

  // Contato ativo do painel direito: usa a conversa existente OU o contato carregado
  // (caso de "iniciar nova conversa" antes da 1ª mensagem sair).
  type ActiveShape = {
    id: string;
    contact_id: string | null;
    nome: string | null;
    phone: string | null;
    cidade: string | null;
    uf: string | null;
    bairro: string | null;
    opt_out: boolean;
    whatsapp_status?: string | null;
  };
  const active: ActiveShape | null = selected ?? (contact
    ? {
        id: "",
        contact_id: contact.id,
        nome: contact.nome,
        phone: contact.phone_e164 ?? contact.phone_whatsapp_candidate,
        cidade: contact.cidade,
        uf: contact.uf,
        bairro: contact.bairro,
        opt_out: Boolean(contact.opt_out_at),
        whatsapp_status: contact.whatsapp_status ?? null,
      }
    : null);

  const timeline = useMemo(() => {
    type Msg = {
      id: string; kind: "in" | "out"; text: string; at: string; meta?: string;
      media_path?: string | null; media_url?: string | null; media_mime?: string | null; media_filename?: string | null;
    };
    const t: Msg[] = [];
    for (const m of convQ.data?.inbound ?? []) {
      const inb = m as {
        id: string; conteudo: string | null; received_at: string;
        media_url?: string | null; media_mime?: string | null; media_filename?: string | null;
      };
      t.push({
        id: `in-${inb.id}`, kind: "in", text: inb.conteudo ?? "", at: inb.received_at,
        media_url: inb.media_url ?? null,
        media_mime: inb.media_mime ?? null,
        media_filename: inb.media_filename ?? null,
      });
    }
    for (const m of convQ.data?.direct ?? []) t.push({
      id: `d-${m.id}`, kind: "out", text: (m as { conteudo?: string }).conteudo ?? "", at: m.created_at as string,
      meta: `${m.sender_name ?? "Você"}${m.status === "erro" ? " · erro" : ""}${m.origem !== "inbox" ? ` · ${m.origem}` : ""}`,
      media_path: (m as { media_path?: string | null }).media_path ?? null,
      media_mime: (m as { media_mime?: string | null }).media_mime ?? null,
      media_filename: (m as { media_filename?: string | null }).media_filename ?? null,
    });
    for (const m of convQ.data?.campaign ?? []) t.push({
      id: `c-${m.id}`, kind: "out", text: m.rendered_message ?? "", at: m.sent_at ?? "",
      meta: `campanha · ${m.campaign_name ?? ""}`,
    });
    return t.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [convQ.data]);

  return (
    <div className="flex h-full min-h-0 bg-muted/10">
      {/* LEFT: conversation list */}
      <div className={`${mobilePane === "list" ? "flex" : "hidden"} md:flex w-full md:w-80 lg:w-96 flex-col border-r bg-background`}>
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
                  <span className="font-medium text-sm truncate">{c.nome ?? c.phone ?? "Sem nome"}</span>
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
                <span className="truncate">{c.last_preview ?? "(sem prévia)"}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 mt-1">
                <span>{c.phone}</span>
                {c.cidade && <span>· {c.cidade}/{c.uf ?? ""}</span>}
                {c.assigned_to && <span className="ml-auto inline-flex items-center gap-0.5"><UserPlus className="h-2.5 w-2.5" />atribuída</span>}
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
                  <div className="text-xs text-muted-foreground truncate">{c.phone}{c.cidade ? ` · ${c.cidade}/${c.uf ?? ""}` : ""}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CENTER: thread */}
      <div className={`${mobilePane === "thread" ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
        {!active ? (
          <div className="flex-1 grid place-items-center text-center text-sm text-muted-foreground p-8">
            <div>
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
              {selectedContactId ? "Carregando conversa…" : "Selecione uma conversa para começar."}
            </div>
          </div>
        ) : (
          <>
            <div className="border-b p-3 flex items-center gap-2 bg-background">
              <button className="md:hidden" onClick={() => setMobilePane("list")}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{active.nome ?? active.phone ?? "Sem nome"}</div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                  <span>{active.phone}</span>
                  {active.cidade && <span>· {active.cidade}/{active.uf ?? ""}</span>}
                  {active.opt_out && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> opt-out</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => conv && flagMut.mutate({ conversation_id: conv.id, flagged: !convQ.data?.conversation?.flagged })}
                  className="p-2 rounded-md hover:bg-muted"
                  title="Sinalizar"
                >
                  {convQ.data?.conversation?.flagged ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <StarOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => conv && statusMut.mutate({ conversation_id: conv.id, status: conv.status === "resolvida" ? "aberta" : "resolvida" })}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1.5 border rounded-md hover:bg-muted"
                >
                  {conv?.status === "resolvida" ? <><RotateCcw className="h-3 w-3" /> Reabrir</> : <><CheckCircle2 className="h-3 w-3" /> Resolver</>}
                </button>
                <button
                  onClick={() => setInfoOpen((v) => !v)}
                  className="hidden md:inline-flex p-2 rounded-md hover:bg-muted"
                  title={infoOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"}
                >
                  {infoOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
                <button className="md:hidden p-2 rounded-md hover:bg-muted" onClick={() => setMobilePane("info")}>
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2260%22%20height%3D%2260%22%3E%3Ccircle%20cx%3D%221%22%20cy%3D%221%22%20r%3D%221%22%20fill%3D%22%23e5e7eb%22%20fill-opacity%3D%22.4%22%2F%3E%3C%2Fsvg%3E')]">
              {convQ.isLoading && <div className="text-sm text-muted-foreground text-center py-4">Carregando…</div>}
              {timeline.length === 0 && !convQ.isLoading && (
                <div className="text-center text-sm text-muted-foreground py-8">Sem mensagens ainda. Envie a primeira!</div>
              )}
              {timeline.map((m) => (
                <div key={m.id} className={`flex ${m.kind === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] md:max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                    m.kind === "out" ? "bg-primary text-primary-foreground rounded-br-none" : "bg-background border rounded-bl-none"
                  }`}>
                    {m.media_path && <MessageMedia path={m.media_path} mime={m.media_mime ?? ""} filename={m.media_filename ?? "arquivo"} />}
                    {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                    <div className={`text-[10px] mt-1 opacity-70 ${m.kind === "out" ? "text-right" : ""}`}>
                      {fmtDate(m.at)}{m.meta ? ` · ${m.meta}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t p-3 bg-background space-y-2">
              {!canSend && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {contact?.opt_out_at ? "Contato optou por sair (opt-out). Envio bloqueado." : "Contato sem WhatsApp válido."}
                </div>
              )}
              {attachment && (
                <div className="flex items-center gap-2 border rounded-md p-2 bg-muted/40">
                  {attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt="" className="h-12 w-12 object-cover rounded" />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="truncate font-medium">{attachment.filename}</div>
                    <div className="text-muted-foreground truncate">{attachment.mime}</div>
                  </div>
                  <button onClick={clearAttachment} className="p-1 rounded hover:bg-background" title="Remover anexo">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
                <button
                  className="p-2 rounded-md hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-40"
                  title="Anexar imagem ou PDF"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canSend || uploading}
                  type="button"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
                {tplsQ.data && tplsQ.data.length > 0 && (
                  <select
                    onChange={(e) => {
                      const t = tplsQ.data?.find((x) => x.id === e.target.value);
                      if (t) setReply((prev) => prev ? prev + "\n" + t.body : t.body);
                      e.currentTarget.value = "";
                    }}
                    className="text-xs px-2 py-2 rounded-md border bg-background shrink-0 hidden sm:block"
                    title="Resposta pronta"
                  >
                    <option value="">📋</option>
                    {tplsQ.data.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                )}
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleSendKeyDown}
                  disabled={!canSend}
                  rows={1}
                  placeholder="Escreva uma mensagem (Enter envia · Shift+Enter quebra linha)"
                  className="flex-1 text-sm px-3 py-2 rounded-md border bg-background resize-none max-h-40"
                  style={{ minHeight: "40px" }}
                />
                <button
                  onClick={submitReply}
                  disabled={!canSend || (!reply.trim() && !attachment) || sendMut.isPending}
                  className="p-2.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
                  title="Enviar"
                >
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* RIGHT: contact panel */}
      {active && (
        <div className={`${mobilePane === "info" ? "flex" : "hidden"} ${infoOpen ? "md:flex" : "md:hidden"} w-full md:w-72 lg:w-80 flex-col border-l bg-background`}>
          <div className="p-4 border-b flex items-start gap-2">
            <button className="md:hidden" onClick={() => setMobilePane("thread")}>
              <X className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{active.nome ?? "Sem nome"}</div>
              <div className="text-xs text-muted-foreground truncate">{active.phone}</div>
              {active.cidade && <div className="text-xs text-muted-foreground truncate">{active.cidade}/{active.uf ?? ""}{active.bairro ? ` · ${active.bairro}` : ""}</div>}
              {active.contact_id && (
                <Link
                  to="/contatos/$id" params={{ id: active.contact_id }} target="_blank"
                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" /> Ver ficha completa
                </Link>
              )}
            </div>
          </div>

          <div className="p-4 border-b space-y-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Atribuído a
              </label>
              <select
                value={conv?.assigned_to ?? ""}
                onChange={(e) => conv && assignMut.mutate({ conversation_id: conv.id, assigned_to: e.target.value || null })}
                className="w-full text-sm mt-1 px-2 py-1.5 rounded border bg-background"
              >
                <option value="">— Ninguém —</option>
                {user && <option value={user.id}>Eu ({staffQ.data?.find((s) => s.id === user.id)?.name ?? "meu usuário"})</option>}
                {(staffQ.data ?? []).filter((s) => s.id !== user?.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1">
                <Flag className="h-3 w-3" /> Status
              </label>
              <select
                value={conv?.status ?? "aberta"}
                onChange={(e) => conv && statusMut.mutate({ conversation_id: conv.id, status: e.target.value as "aberta" | "aguardando" | "resolvida" })}
                className="w-full text-sm mt-1 px-2 py-1.5 rounded border bg-background"
              >
                <option value="aberta">Aberta</option>
                <option value="aguardando">Aguardando</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </div>
          </div>

          <div className="p-4 border-b">
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1 mb-2"
            >
              <StickyNote className="h-3 w-3" /> Notas internas {notesOpen ? "▾" : "▸"}
            </button>
            {notesOpen && (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Anotação privada (não vai para o WhatsApp)…"
                  className="w-full text-sm px-2 py-1.5 rounded border bg-background resize-none"
                />
                <select
                  className="w-full text-xs px-2 py-1 rounded border bg-background"
                  id="note-mention"
                  defaultValue=""
                >
                  <option value="">Sem menção</option>
                  {(staffQ.data ?? []).map((s) => <option key={s.id} value={s.id}>@{s.name}</option>)}
                </select>
                <button
                  disabled={!note.trim() || noteMut.isPending}
                  onClick={() => {
                    if (!conv) return;
                    const mention = (document.getElementById("note-mention") as HTMLSelectElement | null)?.value || undefined;
                    noteMut.mutate({ conversation_id: conv.id, body: note, mention_user_id: mention });
                  }}
                  className="w-full text-xs px-2 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 inline-flex items-center justify-center gap-1"
                >
                  <ClipboardList className="h-3 w-3" /> Adicionar nota
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1 mb-3">
              <Clock className="h-3 w-3" /> Timeline
            </div>
            <div className="space-y-2">
              {(convQ.data?.events ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground italic">Sem eventos ainda.</div>
              )}
              {(convQ.data?.events ?? []).map((e) => (
                <div key={e.id} className="text-xs border-l-2 border-muted pl-2 py-1">
                  <div className="font-medium">{describeEvent(e)}</div>
                  {typeof e.payload.body === "string" && (
                    <div className="text-muted-foreground italic mt-0.5">"{e.payload.body}"</div>
                  )}
                  <div className="text-muted-foreground/70">{fmtDate(e.created_at)} · {e.actor_name ?? "Sistema"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describeEvent(e: { event_type: string; payload: Record<string, string | number | boolean | null> }) {
  switch (e.event_type) {
    case "assigned": return "Conversa atribuída";
    case "unassigned": return "Atribuição removida";
    case "status_changed": return `Status: ${e.payload.from ?? "?"} → ${e.payload.to ?? "?"}`;
    case "note": return "Nota interna adicionada";
    case "mention": return "Mencionou um colega";
    case "flagged": return "Marcada como importante";
    case "unflagged": return "Removida a marcação";
    default: return e.event_type;
  }
}

function fmtDate(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function fmtRel(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch { return `${d}d`; }
}

// ---- Renderiza anexo enviado (imagem/pdf/áudio) via URL assinada temporária.
function MessageMedia({ path, mime, filename }: { path: string; mime: string; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.storage.from("campaign-media").createSignedUrl(path, 60 * 60).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.signedUrl) setErr(true); else setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);

  if (err) return <div className="text-xs opacity-70 mb-1">[anexo indisponível]</div>;
  if (!url) return <div className="text-xs opacity-70 mb-1">carregando anexo…</div>;

  if (mime.startsWith("image/")) {
    return <a href={url} target="_blank" rel="noreferrer" className="block mb-1"><img src={url} alt={filename} className="max-h-64 rounded" /></a>;
  }
  if (mime.startsWith("audio/")) {
    return <audio controls src={url} className="mb-1 max-w-full" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 text-xs underline underline-offset-2">
      <FileText className="h-4 w-4" /> {filename}
    </a>
  );
}
