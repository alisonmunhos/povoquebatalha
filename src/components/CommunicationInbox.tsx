import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/_authenticated/comunicacao/inbox");
import {
  Search, Send, Loader2, Star, StarOff, CheckCircle2, RotateCcw, Paperclip,
  MessageSquare, ExternalLink, AlertTriangle, UserPlus, ArrowLeft, MoreVertical,
  Flag, ClipboardList, StickyNote, Clock, X, PanelRightClose, PanelRightOpen, FileText,
  User, Smile,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { sendDirectMessage, listQuickReplies } from "@/lib/inbox.functions";
import { linkify } from "@/lib/linkify";
import { signCampaignMediaUpload } from "@/lib/campaigns.functions";
import {
  listConversations, getConversation, markConversationRead, assignConversation,
  setConversationStatus, toggleConversationFlag, addConversationNote,
  listCommunicationStaff, searchContactsForNewChat,
  linkConversationToContact,
} from "@/lib/communication.functions";
import { QuickContactFromInboxDialog } from "@/components/QuickContactFromInboxDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

import type { TemplateButton } from "@/lib/whatsapp-templates.functions";

// LID = "Linked ID" do WhatsApp: identificador anônimo (não é telefone real).
// Ex.: "217879546974326@lid".
function isLidPhone(v?: string | null): boolean {
  return Boolean(v && /@lid$/i.test(v));
}
function displayPhone(v?: string | null): string {
  if (!v) return "—";
  if (isLidPhone(v)) return "Contato anônimo (WhatsApp)";
  return v;
}

/** Mostra a razão real da falha; traduz o erro de janela de 24h da Meta. */
function describeSendError(erro?: string | null): string {
  const raw = (erro ?? "").trim();
  if (!raw) return " · erro";
  const low = raw.toLowerCase();
  if (low.includes("131047") || low.includes("re-engagement") || low.includes("reengagement")) {
    return " · fora da janela de 24h — peça pra ele responder, ou use um template";
  }
  return ` · ${raw}`;
}

/** Cor determinística a partir de uma string (id/nome). */
function stringToHslColor(str: string, s = 60, l = 45): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h} ${s}% ${l}%)`;
}

function initialsFromName(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Assignee = { id: string; nome: string | null; avatar_url?: string | null } | null;

function AssigneeChip({ assignee }: { assignee: Assignee }) {
  if (!assignee) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 bg-muted/60 border border-border/60 rounded-full px-1.5 py-0.5">
        <User className="h-2.5 w-2.5" />
        Sem responsável
      </span>
    );
  }
  const nome = assignee.nome ?? "Usuário";
  const bg = stringToHslColor(assignee.id + (assignee.nome ?? ""));
  const textColor = "#ffffff";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] bg-muted/40 border border-border/60 rounded-full pl-0.5 pr-1.5 py-0.5 cursor-default">
          <Avatar className="h-4 w-4 rounded-full" style={{ backgroundColor: bg }}>
            {assignee.avatar_url && <AvatarImage src={assignee.avatar_url} alt={nome} className="h-4 w-4" />}
            <AvatarFallback className="h-4 w-4 text-[8px] font-semibold" style={{ backgroundColor: bg, color: textColor }}>
              {initialsFromName(assignee.nome)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate max-w-[5rem]">{nome}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Responsável: {nome}</p>
      </TooltipContent>
    </Tooltip>
  );
}

type BackendFilter =
  | "all" | "mine" | "unread" | "flagged" | "resolved"
  | "in_service" | "unlinked" | "with_error" | "opt_out";

type StatusFilter = "abertas" | "aguardando" | "resolvidas" | "sinalizadas";

const STATUS_FILTERS: { key: StatusFilter; label: string; backend: BackendFilter }[] = [
  { key: "abertas", label: "Abertas", backend: "all" },
  { key: "aguardando", label: "Aguardando", backend: "all" },
  { key: "resolvidas", label: "Resolvidas", backend: "resolved" },
  { key: "sinalizadas", label: "Sinalizadas", backend: "flagged" },
];

export function CommunicationInbox() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { contact: contactParam } = routeApi.useSearch();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("abertas");
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(contactParam || null);
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

  // Sincroniza seleção com o search param ?contact=... vindo de links externos (ex: "Abrir chat").
  useEffect(() => {
    if (contactParam) {
      setSelectedContactId(contactParam);
      setSelectedConvId(null);
      setMobilePane("thread");
    }
  }, [contactParam]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("inbox.infoOpen", infoOpen ? "1" : "0");
    }
  }, [infoOpen]);

  // Anexo pendente (upload feito, aguardando envio)
  const [attachment, setAttachment] = useState<{ path: string; filename: string; mime: string; previewUrl?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

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
  const linkFn = useServerFn(linkConversationToContact);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const backendFilter = STATUS_FILTERS.find((f) => f.key === statusFilter)!.backend;

  const listQ = useQuery({
    queryKey: ["comm-conv-list", statusFilter, search],
    queryFn: () => listFn({ data: { filter: backendFilter, search: search || undefined } }),
    refetchInterval: 15000,
  });

  const rawList = listQ.data ?? [];
  const list = useMemo(() => {
    if (statusFilter === "abertas") return rawList.filter((c) => c.status === "aberta");
    if (statusFilter === "aguardando") return rawList.filter((c) => c.status === "aguardando");
    return rawList;
  }, [rawList, statusFilter]);
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
  const staffQ = useQuery({
    queryKey: ["comm-staff"],
    queryFn: () => staffFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

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
      // Input já foi limpo otimisticamente em submitReply(); aqui só sincronizamos as queries.
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      toast.success("Mensagem enviada");
    },
    onError: (e, vars) => {
      // Rollback: se falhou, devolve o texto pro input para o usuário reenviar/corrigir.
      setReply((prev) => prev.length > 0 ? prev : (vars?.message ?? ""));
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    },
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

  const linkMut = useMutation({
    mutationFn: (v: { conversation_id: string; contact_id: string }) => linkFn({ data: v }),
    onSuccess: (res) => {
      toast.success("Conversa vinculada");
      setSelectedContactId(null);
      setSelectedConvId(res.conversation_id);
      qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
      qc.invalidateQueries({ queryKey: ["comm-conv"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  function onQuickContactCreated(contactId: string) {
    setSelectedContactId(contactId);
    setSelectedConvId(null);
    qc.invalidateQueries({ queryKey: ["comm-conv-list"] });
    qc.invalidateQueries({ queryKey: ["comm-conv"] });
  }

  function openConversation(contactId: string | null, convId: string | null, unread: number) {
    setSelectedContactId(contactId);
    setSelectedConvId(contactId ? null : convId);
    setMobilePane("thread");
    if (contactId && unread > 0) readMut.mutate(contactId);
  }

  function submitReply() {
    if (!selectedContactId) return;
    if (!reply.trim() && !attachment) return;
    // Optimistic clear: input limpa e anexo some assim que o usuário confirma o envio,
    // evitando cliques repetidos enquanto a mutation ainda está em voo.
    const payload = {
      contact_id: selectedContactId,
      message: reply,
      media_path: attachment?.path ?? null,
      media_mime: attachment?.mime ?? null,
      media_filename: attachment?.filename ?? null,
    };
    setReply("");
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    sendMut.mutate(payload);
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
      header_type?: string | null; header_text?: string | null;
      buttons?: TemplateButton[];
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
      meta: `${m.sender_name ?? "Você"}${m.status === "erro" ? describeSendError((m as { erro?: string | null }).erro) : ""}${m.origem !== "inbox" ? ` · ${m.origem}` : ""}`,
      media_path: (m as { media_path?: string | null }).media_path ?? null,
      media_mime: (m as { media_mime?: string | null }).media_mime ?? null,
      media_filename: (m as { media_filename?: string | null }).media_filename ?? null,
    });
    for (const m of convQ.data?.campaign ?? []) t.push({
      id: `c-${m.id}`, kind: "out", text: m.rendered_message ?? "", at: m.sent_at ?? "",
      meta: `campanha · ${m.campaign_name ?? ""}`,
      header_type: m.header_type,
      header_text: m.header_text,
      buttons: m.buttons,
    });
    return t.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [convQ.data]);

  // Auto-scroll: quando chega mensagem nova (in ou out), rolar thread até o fim.
  useEffect(() => {
    if (!threadEndRef.current) return;
    threadEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timeline.length, selectedContactId, selectedConvId]);



  return (
    <TooltipProvider delayDuration={200}>
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
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              const count = active ? list.length : undefined;
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  }`}
                >
                  {f.label}
                  {count !== undefined && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[1.125rem] px-1 rounded-full text-[10px] font-semibold ${
                        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
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
                <span className="truncate">{c.last_preview ?? "(sem prévia)"}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 mt-1">
                <span className={isLidPhone(c.phone) ? "font-mono" : ""}>{displayPhone(c.phone)}</span>
                {c.cidade && <span>· {c.cidade}/{c.uf ?? ""}</span>}
                <span className="ml-auto">
                  <AssigneeChip assignee={c.assignee ?? null} />
                </span>
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
                <div className="font-semibold truncate">
                  {active.nome ?? (isLidPhone(active.phone) ? "Sem contato vinculado" : (active.phone ?? "Sem nome"))}
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                  <span className={isLidPhone(active.phone) ? "font-mono text-[10px]" : ""}>{displayPhone(active.phone)}</span>
                  {active.cidade && <span>· {active.cidade}/{active.uf ?? ""}</span>}
                  {conv?.first_message_direction && (
                    <span className="text-muted-foreground/70">
                      · {conv.first_message_direction === "in" ? "iniciada pelo contato" : "iniciada pela equipe"}
                    </span>
                  )}
                  {active.opt_out && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> opt-out</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => conv && flagMut.mutate({ conversation_id: conv.id, flagged: !convQ.data?.conversation?.flagged })}
                  className="p-2 rounded-md hover:bg-muted"
                  aria-label={convQ.data?.conversation?.flagged ? "Remover sinalização da conversa" : "Sinalizar conversa"}
                  title={convQ.data?.conversation?.flagged ? "Remover sinalização" : "Sinalizar"}
                >
                  {convQ.data?.conversation?.flagged ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <StarOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => conv && statusMut.mutate({ conversation_id: conv.id, status: conv.status === "resolvida" ? "aberta" : "resolvida" })}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1.5 border rounded-md hover:bg-muted"
                  aria-label={conv?.status === "resolvida" ? "Reabrir conversa" : "Marcar conversa como resolvida"}
                >
                  {conv?.status === "resolvida" ? <><RotateCcw className="h-3 w-3" /> Reabrir</> : <><CheckCircle2 className="h-3 w-3" /> Resolver</>}
                </button>
                <button
                  onClick={() => setInfoOpen((v) => !v)}
                  className="hidden md:inline-flex p-2 rounded-md hover:bg-muted"
                  aria-label={infoOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"}
                  title={infoOpen ? "Ocultar detalhes do contato" : "Mostrar detalhes do contato"}
                >
                  {infoOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
                <button className="md:hidden p-2 rounded-md hover:bg-muted" aria-label="Mostrar detalhes do contato" onClick={() => setMobilePane("info")}>
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
                    {m.header_type === "TEXT" && m.header_text && (
                      <div className="font-semibold whitespace-pre-wrap break-words mb-1">{m.header_text}</div>
                    )}
                    {m.media_path && <MessageMedia path={m.media_path} mime={m.media_mime ?? ""} filename={m.media_filename ?? "arquivo"} />}
                    {m.media_url && <InboundMedia url={m.media_url} mime={m.media_mime ?? ""} filename={m.media_filename ?? "arquivo"} />}
                    {m.text && <div className="whitespace-pre-wrap break-words">{linkify(m.text)}</div>}
                    {m.buttons && m.buttons.length > 0 && (
                      <>
                        <div className={`h-px w-full my-2 ${m.kind === "out" ? "bg-primary-foreground/20" : "bg-border"}`} />
                        <div className="-mx-3 -mb-2 flex flex-col rounded-b-lg overflow-hidden">
                          {m.buttons.map((b, idx) => {
                            const label = b.text.toUpperCase();
                            const baseClass = `w-full py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors border-t first:border-t-0 ${
                              m.kind === "out"
                                ? "text-primary-foreground hover:bg-primary-foreground/10 border-primary-foreground/15"
                                : "text-primary hover:bg-primary/5 border-border"
                            }`;
                            const icon = b.type === "URL" ? <ExternalLink className="h-3.5 w-3.5" /> : null;
                            if (b.type === "URL") {
                              return (
                                <a key={idx} href={b.url} target="_blank" rel="noopener noreferrer" className={baseClass}>
                                  {icon}
                                  <span>{label}</span>
                                </a>
                              );
                            }
                            if (b.type === "PHONE_NUMBER") {
                              return (
                                <a key={idx} href={`tel:${b.phone_number}`} className={baseClass}>
                                  {icon}
                                  <span>{label}</span>
                                </a>
                              );
                            }
                            return (
                              <div key={idx} className={baseClass}>
                                {icon}
                                <span>{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <div className={`text-[10px] mt-1 opacity-70 ${m.kind === "out" ? "text-right" : ""}`}>
                      {fmtDate(m.at)}{m.meta ? ` · ${m.meta}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            {conv && !conv.contact_id && (
              <UnlinkedBanner
                phone={conv.from_phone ?? ""}
                onQuick={() => setQuickCreateOpen(true)}
                onLink={(contact_id) =>
                  linkMut.mutate({ conversation_id: conv.id, contact_id })
                }
              />
            )}

            <div className="border-t p-3 bg-background space-y-2">
              {!canSend && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {contact?.opt_out_at
                    ? "Contato optou por sair (opt-out). Envio bloqueado."
                    : conv && !conv.contact_id
                      ? "Vincule esta conversa a um contato antes de responder."
                      : "Contato sem WhatsApp válido."}
                </div>
              )}
              {canSend && contact && !contact.consentimento_whatsapp && (
                <div className="text-[11px] text-amber-700 bg-amber-50/60 border border-amber-200/70 rounded-md p-1.5">
                  ⚠ Contato sem consentimento WhatsApp explícito. Envie apenas se houver base legal.
                </div>
              )}
              {canSend && conv?.assigned_to && conv.assigned_to !== user?.id && (
                <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-1.5">
                  Em atendimento por outro operador. Cuidado ao responder.
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
              <div className="text-xs text-muted-foreground truncate">{active.phone ?? conv?.from_phone ?? "Sem telefone"}</div>
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

          {contact && (
            <div className="p-4 border-b space-y-1.5 text-xs">
              {contact.profissao && (
                <div><span className="text-muted-foreground">Profissão:</span> {contact.profissao}</div>
              )}
              {(() => {
                // Se já houve mensagens (in ou out) nesta conversa, o WhatsApp claramente responde:
                // mostramos "ativo" independente do whatsapp_status legado ("desconhecido").
                const hasTraffic = timeline.length > 0;
                const raw = (contact.whatsapp_status ?? "").toLowerCase();
                const isProblem = raw === "invalido" || raw === "invalid" || raw === "erro_envio" || raw === "opt_out";
                const label = isProblem ? contact.whatsapp_status : (hasTraffic ? "ativo" : (raw && raw !== "desconhecido" && raw !== "unknown" ? contact.whatsapp_status : null));
                if (!label) return null;
                return (
                  <div>
                    <span className="text-muted-foreground">WhatsApp:</span>{" "}
                    <span className={isProblem ? "text-destructive" : "text-emerald-700"}>{label}</span>
                  </div>
                );
              })()}
              <div>
                <span className="text-muted-foreground">Consentimento:</span>{" "}
                {contact.consentimento_whatsapp
                  ? <span className="text-emerald-700">sim</span>
                  : <span className="text-amber-700">não</span>}
              </div>
              {contact.opt_out_at && (
                <div className="text-destructive font-medium">Opt-out ativo desde {fmtDate(contact.opt_out_at)}</div>
              )}
              {Array.isArray(contact.formas_ajuda) && contact.formas_ajuda.length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1">Formas de ajuda:</div>
                  <div className="flex flex-wrap gap-1">
                    {contact.formas_ajuda.map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {(convQ.data?.tags?.length ?? 0) > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1">Tags:</div>
                  <div className="flex flex-wrap gap-1">
                    {(convQ.data?.tags ?? []).map((t) => (
                      <span
                        key={t.id}
                        className="px-1.5 py-0.5 rounded text-[10px] border"
                        style={t.cor ? { borderColor: t.cor, color: t.cor } : undefined}
                      >
                        {t.nome}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(convQ.data?.campaign?.length ?? 0) > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1">Últimas campanhas:</div>
                  <ul className="space-y-0.5">
                    {(convQ.data?.campaign ?? []).slice(-3).reverse().map((c) => (
                      <li key={c.id} className="truncate">
                        · {c.campaign_name ?? "—"} {c.sent_at ? `(${fmtDate(c.sent_at)})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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

      {conv && !conv.contact_id && (
        <QuickContactFromInboxDialog
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          conversationId={conv.id}
          suggestedNome={active?.nome ?? null}
          originPhone={conv.from_phone}
          onCreated={onQuickContactCreated}
        />
      )}
    </div>
    </TooltipProvider>
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

// ---- Renderiza mídia recebida (Z-API entrega URL pública temporária).
function InboundMedia({ url, mime, filename }: { url: string; mime: string; filename: string }) {
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

// ---- Banner de conversa "não vinculada": salvar como contato OU vincular a contato existente.
function UnlinkedBanner({
  phone,
  onQuick,
  onLink,
}: {
  phone: string;
  onQuick: () => void;
  onLink: (contact_id: string) => void;
}) {
  const [mode, setMode] = useState<"none" | "link">("none");
  const [q, setQ] = useState("");
  const searchFn = useServerFn(searchContactsForNewChat);
  const searchQ = useQuery({
    queryKey: ["comm-unlinked-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: mode === "link" && q.trim().length >= 2,
  });

  const lid = isLidPhone(phone);
  return (
    <div className="border-b bg-amber-50/60 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-amber-900">Conversa não vinculada</div>
          <div className="text-amber-800/80 truncate">
            {lid ? (
              <>Origem: <span className="font-mono">{phone}</span> — identificador anônimo do WhatsApp (não é telefone real).</>
            ) : (
              <>Número de origem: <span className="font-mono">{phone || "—"}</span></>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={onQuick}
            className="px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100 inline-flex items-center gap-1"
            title="Abrir ficha completa para salvar como contato"
          >
            <UserPlus className="h-3 w-3" /> Salvar como contato
          </button>
          <button
            onClick={() => setMode(mode === "link" ? "none" : "link")}
            className="px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100"
          >
            Vincular existente
          </button>
        </div>
      </div>
      {mode === "link" && (
        <div className="space-y-2">
          <input
            className="w-full px-2 py-1.5 rounded border bg-background"
            placeholder="Buscar contato por nome ou telefone…"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto rounded border bg-background">
            {(searchQ.data ?? []).map((c) => (
              <button key={c.id} onClick={() => onLink(c.id)}
                className="w-full text-left px-2 py-1.5 border-b hover:bg-muted text-xs">
                <div className="font-medium truncate">{c.nome ?? "Sem nome"}</div>
                <div className="text-muted-foreground truncate">{c.phone}</div>
              </button>
            ))}
            {q.trim().length >= 2 && (searchQ.data ?? []).length === 0 && (
              <div className="text-center text-muted-foreground p-3">Nenhum contato encontrado.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

