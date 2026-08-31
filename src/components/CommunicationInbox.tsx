import { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, getRouteApi } from "@tanstack/react-router";

const routeApi = getRouteApi("/_authenticated/comunicacao/inbox");
import {
  Search, Send, Loader2, Star, StarOff, CheckCircle2, RotateCcw, Paperclip,
  MessageSquare, ExternalLink, AlertTriangle, UserPlus, ArrowLeft, MoreVertical,
  Flag, ClipboardList, StickyNote, Clock, X, PanelRightClose, PanelRightOpen, FileText,
  Smile, MessageSquareText, Image as ImageIcon, ChevronDown, Bot, Music, Copy, Check, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { sendDirectMessage, listQuickReplies } from "@/lib/inbox.functions";
import { signCampaignMediaUpload } from "@/lib/campaigns.functions";
import {
  listConversationsV2, getConversation, markConversationRead, markConversationUnread,
  assignConversation,
  setConversationStatus, toggleConversationFlag, addConversationNote,
  listCommunicationStaff, searchContactsForNewChat,
  linkConversationToContact, getMyCommunicationBadge,
  addContactTagFromInbox, removeContactTagFromInbox, updateContactFormasAjudaFromInbox,
  listWindowOpenPinned, archiveAndOptOutConversation,
} from "@/lib/communication.functions";
import { listWhatsappFlows, startWhatsappFlowManually } from "@/lib/whatsapp-flows.functions";
import { windowState } from "@/lib/inbox-window";
import { getCatalogField } from "@/lib/form-field-catalog";

import { QuickContactFromInboxDialog } from "@/components/QuickContactFromInboxDialog";
import { SendWhatsAppWizard } from "@/components/SendWhatsAppWizard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactTagPicker, type InboxTagRow } from "@/components/inbox/ContactTagPicker";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

// Formatos de áudio aceitos pela API oficial do WhatsApp (Cloud API) pra
// mensagem de áudio: AAC, AMR, MP3, MP4/M4A e OGG (só codec Opus — nota de
// voz). Limite de tamanho da própria Meta pra áudio: 16MB (maior que o limite
// de 15MB já usado aqui pros outros anexos, por isso checado à parte).
const AUDIO_MIME_TYPES = ["audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg"];
const AUDIO_ACCEPT = AUDIO_MIME_TYPES.join(",");
const AUDIO_MAX_BYTES = 16 * 1024 * 1024;

import {
  buildTimelineItems, receiptFrom, fmtBytes, type InboxMsg,
} from "@/lib/inbox-timeline";
import {
  MessageBubble, DaySeparator, UnreadDivider, SystemMessage,
} from "@/components/inbox/MessageBubble";
import {
  ConversationRow, ConversationSkeleton, isLidPhone, displayPhone, WindowBadge,
} from "@/components/inbox/ConversationRow";
import { InboxAvatar } from "@/components/inbox/InboxAvatar";



// Mesmo catálogo usado no construtor de formulários e na Gestão da Base —
// nunca duplicar a lista de opções aqui.
const FORMAS_AJUDA_OPTIONS = getCatalogField("formas_ajuda")?.options ?? [];

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




// Chip (recorte de QUAIS conversas aparecem) separado de ordenação (sort, mais
// abaixo) — Etapa 2 da reforma do Inbox. Os valores batem 1:1 com o enum novo
// de listConversations em communication.functions.ts (INBOX_CHIPS); os
// filtros antigos ("all", "mine", "unread"...) continuam existindo só pra
// compatibilidade com a UI alternativa em inbox-astryx/AstryxInbox.tsx, que
// este componente não usa mais.
type InboxChip =
  | "todas"
  | "aberta"
  | "aguardando"
  | "resolvida"
  | "sinalizada"
  | "chat_disponivel"
  | "expirando"
  | "minhas"
  | "ultimo_disparo";

type InboxSort = "ultima_interacao" | "expira_primeiro" | "aguardando_resposta";

const INBOX_CHIPS: { key: InboxChip; label: string; hint: string }[] = [
  {
    key: "aberta",
    label: "Em aberto",
    hint: 'Conversas em andamento — exclui quem só recebeu um disparo de campanha sem responder (veja o chip "Último disparo").',
  },
  {
    key: "aguardando",
    label: "Aguardando",
    hint: "Você já respondeu e está esperando algo da pessoa.",
  },
  { key: "todas", label: "Todas", hint: "Todo mundo, qualquer status (menos arquivadas)." },
  { key: "resolvida", label: "Resolvidas", hint: "Conversas já encerradas." },
  {
    key: "sinalizada",
    label: "Sinalizadas",
    hint: "Conversas marcadas com a bandeirinha para revisar depois.",
  },
  {
    key: "chat_disponivel",
    label: "Chat disponível",
    hint: "Dentro da janela de 24h do WhatsApp: dá pra responder com texto livre agora, de qualquer pessoa e qualquer status.",
  },
  {
    key: "expirando",
    label: "Expirando",
    hint: "A janela de 24h fecha em menos de 4 horas — responda logo ou a pessoa só recebe template.",
  },
  {
    key: "minhas",
    label: "Minhas",
    hint: "Atribuídas a você, dentro do conjunto ativo (aberta/aguardando).",
  },
  {
    key: "ultimo_disparo",
    label: "Último disparo",
    hint: "A última coisa que rolou foi um disparo de campanha nosso, sem resposta ainda — independente do status.",
  },
];

const INBOX_SORTS: { key: InboxSort; label: string }[] = [
  { key: "ultima_interacao", label: "Última interação" },
  { key: "expira_primeiro", label: "Janela expira primeiro" },
  { key: "aguardando_resposta", label: "Aguardando resposta primeiro" },
];

export function CommunicationInbox() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { contact: contactParam } = routeApi.useSearch();
  const [chip, setChip] = useState<InboxChip>("aberta");
  const [sort, setSort] = useState<InboxSort>("ultima_interacao");
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
  const [attachment, setAttachment] = useState<{ path: string; filename: string; mime: string; size?: number | null; previewUrl?: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [fileAccept, setFileAccept] = useState("image/png,image/jpeg,image/jpg,image/webp,application/pdf");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Botões de resposta rápida pendentes (vindos de uma mensagem salva) — mutuamente
  // exclusivo com anexo, mesma regra do MessageComposer/motor único de envio.
  const [pendingButtons, setPendingButtons] = useState<{ text: string }[] | null>(null);

  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  // Cresce a caixa de texto conforme o conteúdo, até o limite de max-h-40 (160px).
  useEffect(() => {
    const el = replyRef.current;
    if (!el) return;
    el.style.height = "40px";
    if (reply) el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [reply]);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const cursorRef = useRef({ start: 0, end: 0 });

  const listFn = useServerFn(listConversationsV2);
  const convFn = useServerFn(getConversation);
  const readFn = useServerFn(markConversationRead);
  const unreadFn = useServerFn(markConversationUnread);
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
  const addTagFn = useServerFn(addContactTagFromInbox);
  const removeTagFn = useServerFn(removeContactTagFromInbox);
  const formasAjudaFn = useServerFn(updateContactFormasAjudaFromInbox);
  const pinnedFn = useServerFn(listWindowOpenPinned);
  const archiveOptOutFn = useServerFn(archiveAndOptOutConversation);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [templateSendOpen, setTemplateSendOpen] = useState(false);

  // Mesma fonte do badge numérico da aba "Inbox" na navegação (mantida para
  // refetch periódico; a contagem exibida nos chips vem da própria lista).
  const inboxBadgeFn = useServerFn(getMyCommunicationBadge);
  useQuery({
    queryKey: ["comm-badge"],
    queryFn: () => inboxBadgeFn(),
    refetchInterval: 20000,
  });

  // Faixa fixa "Dentro da janela agora" — independente do chip/ordenação da
  // lista principal abaixo.
  const pinnedQ = useQuery({
    queryKey: ["comm-conv-pinned"],
    queryFn: () => pinnedFn(),
    refetchInterval: 15000,
  });

  // Rolagem infinita real (offset), uma leva por vez — cada leva já vem
  // filtrada/ordenada/contada pelo servidor, então lista e contador nunca
  // divergem entre si.
  const PAGE_SIZE = 60;
  const listQ = useInfiniteQuery({
    queryKey: ["comm-conv-list-v2", chip, sort, search],
    queryFn: ({ pageParam }) =>
      listFn({
        data: { filter: chip, sort, search: search || undefined, offset: pageParam, limit: PAGE_SIZE },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.has_more ? allPages.length * PAGE_SIZE : undefined,
    refetchInterval: 15000,
  });

  const list = useMemo(() => listQ.data?.pages.flatMap((p) => p.list) ?? [], [listQ.data]);
  const listTotal = listQ.data?.pages.at(-1)?.total ?? 0;
  const listCapped = listQ.data?.pages.at(-1)?.capped ?? false;
  const hasMore = Boolean(listQ.hasNextPage);

  // Sentinela de fim de lista pra carregar a próxima leva sozinho, sem botão.
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && listQ.hasNextPage && !listQ.isFetchingNextPage) {
          void listQ.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [listQ]);

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
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const filteredQuickReplies = useMemo(() => {
    const all = tplsQ.data ?? [];
    const s = quickSearch.trim().toLowerCase();
    if (!s) return all;
    return all.filter((t) =>
      (t.title ?? "").toLowerCase().includes(s) || (t.body ?? "").toLowerCase().includes(s),
    );
  }, [tplsQ.data, quickSearch]);

  // Fluxos de cadastro (robô) disponíveis para iniciar dentro da conversa.
  const flowsFn = useServerFn(listWhatsappFlows);
  const startFlowFn = useServerFn(startWhatsappFlowManually);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowSearch, setFlowSearch] = useState("");
  const flowsQ = useQuery({
    queryKey: ["comm-flows"],
    queryFn: () => flowsFn(),
    staleTime: 60_000,
    retry: false,
  });
  const activeFlows = useMemo(() => {
    const all = (flowsQ.data?.flows ?? []) as {
      id: string; nome: string; descricao: string | null; active: boolean;
    }[];
    const s = flowSearch.trim().toLowerCase();
    const on = all.filter((f) => f.active);
    if (!s) return on;
    return on.filter(
      (f) => f.nome.toLowerCase().includes(s) || (f.descricao ?? "").toLowerCase().includes(s),
    );
  }, [flowsQ.data, flowSearch]);

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
        qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
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
    mutationFn: (vars: { contact_id?: string; conversation_id?: string }) => readFn({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
    },
  });

  const unreadMut = useMutation({
    mutationFn: (v: { conversation_id: string }) => unreadFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
      toast.success("Conversa marcada como não lida");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao marcar como não lida"),
  });



  const sendMut = useMutation({
    mutationFn: (payload: {
      contact_id?: string; conversation_id?: string; message: string;
      media_path?: string | null; media_mime?: string | null; media_filename?: string | null;
      buttons?: { text: string }[];
    }) => sendFn({ data: { ...payload, origem: "inbox" } }),
    onSuccess: () => {
      // Input já foi limpo otimisticamente em submitReply(); aqui só sincronizamos as queries.
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
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
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
      const notified = (res as { notified?: number; not_notified?: string[] } | undefined);
      if (notified?.notified) {
        toast.success("Atribuição atualizada — aviso enviado no WhatsApp");
      } else if (notified?.not_notified?.length) {
        const semZap = notified.not_notified.some((r) => r.includes("sem_"));
        toast.warning(
          semZap
            ? "Responsável definido, mas sem WhatsApp vinculado — aviso não enviado"
            : "Responsável definido, mas o aviso no WhatsApp falhou",
        );
      } else {
        toast.success("Atribuição atualizada");
      }
    },
  });

  const statusMut = useMutation({
    mutationFn: (v: { conversation_id: string; status: "aberta" | "aguardando" | "resolvida" }) => statusFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
      toast.success("Status atualizado");
    },
  });

  const flagMut = useMutation({
    mutationFn: (v: { conversation_id: string; flagged: boolean }) => flagFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] }),
  });

  const archiveOptOutMut = useMutation({
    mutationFn: (v: { conversation_id: string; contact_id: string }) => archiveOptOutFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
      qc.invalidateQueries({ queryKey: ["comm-conv-pinned"] });
      qc.invalidateQueries({ queryKey: ["comm-badge"] });
      toast.success("Contato marcado como opt-out e conversa arquivada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao arquivar/opt-out"),
  });

  const noteMut = useMutation({
    mutationFn: (v: { conversation_id: string; body: string; mention_user_id?: string }) => noteFn({ data: v }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      toast.success("Nota adicionada");
    },
  });

  // Painel do contato: tags e formas de ajuda salvam a cada clique, sem toast
  // de sucesso (só erro gera toast) — um "✓" discreto (savedFlash) confirma
  // pra não virar ruído a cada interação.
  const [savedFlash, setSavedFlash] = useState<"tags" | "formas_ajuda" | null>(null);
  function flashSaved(key: "tags" | "formas_ajuda") {
    setSavedFlash(key);
    window.setTimeout(() => setSavedFlash((cur) => (cur === key ? null : cur)), 1500);
  }

  const addTagMut = useMutation({
    mutationFn: (v: { contact_id: string; tag_id: string }) => addTagFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      flashSaved("tags");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao adicionar tag"),
  });

  const removeTagMut = useMutation({
    mutationFn: (v: { contact_id: string; tag_id: string }) => removeTagFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      flashSaved("tags");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover tag"),
  });

  const formasAjudaMut = useMutation({
    mutationFn: (v: { contact_id: string; formas_ajuda: string[] }) => formasAjudaFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      flashSaved("formas_ajuda");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar formas de ajuda"),
  });

  const [copiedContact, setCopiedContact] = useState(false);
  function copyContactFormatted() {
    const c = convQ.data?.contact;
    if (!c) return;
    const lines: string[] = [];
    if (c.nome) lines.push(`Nome: ${c.nome}`);
    const phone = c.phone_e164 ?? conv?.from_phone ?? null;
    if (phone) lines.push(`Telefone: ${phone}`);
    if (c.endereco_completo) lines.push(`Endereço: ${c.endereco_completo}`);
    if (c.profissao) lines.push(`Profissão: ${c.profissao}`);
    if (Array.isArray(c.formas_ajuda) && c.formas_ajuda.length > 0) {
      const labels = c.formas_ajuda.map(
        (v) => FORMAS_AJUDA_OPTIONS.find((o) => o.value === v)?.label ?? v,
      );
      lines.push(`Formas de ajuda: ${labels.join(", ")}`);
    }
    if (c.observacoes) lines.push(`Observações: ${c.observacoes}`);
    if (lines.length === 0) return;
    void navigator.clipboard.writeText(lines.join("\n"));
    setCopiedContact(true);
    window.setTimeout(() => setCopiedContact(false), 1500);
  }

  const linkMut = useMutation({
    mutationFn: (v: { conversation_id: string; contact_id: string }) => linkFn({ data: v }),
    onSuccess: (res) => {
      toast.success("Conversa vinculada");
      setSelectedContactId(null);
      setSelectedConvId(res.conversation_id);
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
      qc.invalidateQueries({ queryKey: ["comm-conv"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  function onQuickContactCreated(contactId: string) {
    setSelectedContactId(contactId);
    setSelectedConvId(null);
    qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
    qc.invalidateQueries({ queryKey: ["comm-conv"] });
  }

  function openConversation(contactId: string | null, convId: string | null, unread: number) {
    setSelectedContactId(contactId);
    setSelectedConvId(contactId ? null : convId);
    setMobilePane("thread");
    // Conversas sem contato vinculado (mensagens antigas) também precisam ser marcadas.
    if (unread > 0 && (contactId || convId)) {
      readMut.mutate(contactId ? { contact_id: contactId } : { conversation_id: convId! });
    }
  }

  const selectedIndex = useMemo(
    () => list.findIndex((c) => (selectedConvId ? c.id === selectedConvId : c.contact_id === selectedContactId)),
    [list, selectedContactId, selectedConvId],
  );

  function selectByIndex(i: number) {
    const c = list[i];
    if (!c) return;
    openConversation(c.contact_id, c.id, c.unread ?? 0);
  }

  function goRelative(delta: number) {
    if (list.length === 0) return;
    const base = selectedIndex >= 0 ? selectedIndex : (delta > 0 ? -1 : list.length);
    selectByIndex(Math.min(list.length - 1, Math.max(0, base + delta)));
  }

  /** Resolve a conversa atual e já abre a próxima da lista. */
  function resolveAndNext() {
    const cur = list[selectedIndex];
    if (!cur) return;
    const next = list[selectedIndex + 1] ?? null;
    statusMut.mutate({ conversation_id: cur.id, status: "resolvida" });
    if (next) {
      openConversation(next.contact_id, next.id, next.unread ?? 0);
    } else {
      setSelectedContactId(null);
      setSelectedConvId(null);
      setMobilePane("list");
    }
  }

  /** Ação destrutiva (some da tela) — sempre confirma antes. Mesmo padrão do
   * resolveAndNext: captura a próxima conversa ANTES de disparar a mutation. */
  function archiveAndOptOutAndNext() {
    const cur = list[selectedIndex];
    if (!cur || !cur.contact_id) return;
    const ok = window.confirm(
      "Marcar este contato como opt-out e arquivar a conversa? Ele para de receber mensagens e some do Inbox.",
    );
    if (!ok) return;
    const next = list[selectedIndex + 1] ?? null;
    archiveOptOutMut.mutate({ conversation_id: cur.id, contact_id: cur.contact_id });
    if (next) {
      openConversation(next.contact_id, next.id, next.unread ?? 0);
    } else {
      setSelectedContactId(null);
      setSelectedConvId(null);
      setMobilePane("list");
    }
  }

  // Atalhos de teclado (só quando o foco não está num campo de texto).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const cur = list[selectedIndex] ?? null;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); goRelative(1); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); goRelative(-1); }
      else if (k === "r") { e.preventDefault(); replyRef.current?.focus(); }
      else if (k === "e" && cur) { e.preventDefault(); resolveAndNext(); }
      else if (k === "u" && cur) { e.preventDefault(); unreadMut.mutate({ conversation_id: cur.id }); }
      else if (k === "f" && cur) { e.preventDefault(); flagMut.mutate({ conversation_id: cur.id, flagged: !cur.flagged }); }
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "Escape") { setMobilePane("list"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, selectedIndex]);



  function submitReply() {
    // Conversa sem contato vinculado ainda pode responder (usa
    // conversations.from_phone no servidor) — só bloqueia se não houver
    // nem contato nem conversa selecionada.
    if (!selectedContactId && !selectedConvId) return;
    if (!reply.trim() && !attachment) return;
    // Optimistic clear: input limpa e anexo some assim que o usuário confirma o envio,
    // evitando cliques repetidos enquanto a mutation ainda está em voo.
    const payload = {
      contact_id: selectedContactId ?? undefined,
      conversation_id: selectedContactId ? undefined : (selectedConvId ?? undefined),
      message: reply,
      media_path: attachment?.path ?? null,
      media_mime: attachment?.mime ?? null,
      media_filename: attachment?.filename ?? null,
      buttons: pendingButtons ?? [],
    };
    setReply("");
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
    setPendingButtons(null);
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
    const okTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf", ...AUDIO_MIME_TYPES];
    if (!okTypes.includes(f.type)) { toast.error("Envie PNG, JPG, WEBP, PDF ou áudio (AAC, AMR, MP3, MP4/M4A, OGG)."); return; }
    const isAudio = AUDIO_MIME_TYPES.includes(f.type);
    const maxBytes = isAudio ? AUDIO_MAX_BYTES : 15 * 1024 * 1024;
    if (f.size > maxBytes) { toast.error(isAudio ? "Máx. 16MB pra áudio." : "Máx. 15MB."); return; }
    setUploading(true);
    try {
      const s = await signFn({ data: { filename: f.name, contentType: f.type } });
      const up = await supabase.storage.from("campaign-media").uploadToSignedUrl(s.path, s.token, f, {
        contentType: f.type, upsert: true,
      });
      if (up.error) throw up.error;
      const previewUrl = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      setAttachment({ path: s.path, filename: s.filename, mime: f.type, size: f.size, previewUrl });
      setPendingButtons(null); // anexo e botões são mutuamente exclusivos
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
  // Conversa sem contato vinculado também pode responder, usando o telefone da
  // própria conversa (conversations.from_phone) — vincular contato continua
  // disponível (banner acima), mas deixou de ser obrigatório pra enviar.
  // Opt-out de contato vinculado continua bloqueando; para conversa sem
  // contato o servidor faz a checagem equivalente por telefone.
  const canSendUnlinked = Boolean(conv && !conv.contact_id && conv.from_phone);
  const canSend = Boolean(
    (contact && !contact.opt_out_at && (contact.phone_e164 || contact.phone_whatsapp_candidate)) || canSendUnlinked,
  );

  // Janela de 24h da Meta: só dá pra mandar texto livre (ou iniciar o robô) se a
  // pessoa escreveu recentemente. `conv.last_inbound_at` vem de `conversations`
  // (mantido por gatilho no servidor) — fonte confiável, não depende de quantas
  // mensagens antigas foram carregadas nesta tela.
  const convWindow = useMemo(
    () => windowState((conv as { last_inbound_at?: string | null } | undefined)?.last_inbound_at ?? null),
    [conv],
  );
  const windowOpen = convWindow.open;
  // Fora da janela de 24h, texto livre (e o robô, que também manda texto livre
  // pra abrir a conversa) não chega — só template aprovado reabre a janela.
  const canSendFreeText = canSend && windowOpen;
  const flowPhone =
    contact?.phone_e164 ?? contact?.phone_whatsapp_candidate ?? selected?.phone ?? null;

  const startFlowMut = useMutation({
    mutationFn: (flowId: string) =>
      startFlowFn({ data: { flow_id: flowId, phone: flowPhone ?? "" } }),
    onSuccess: () => {
      toast.success("Fluxo iniciado — o robô já mandou a abertura e a 1ª pergunta.");
      qc.invalidateQueries({ queryKey: ["comm-conv", convKey] });
      qc.invalidateQueries({ queryKey: ["comm-conv-list-v2"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar o fluxo."),
  });

  const startFlow = (flow: { id: string; nome: string }) => {
    if (!flowPhone) {
      toast.error("Esta conversa não tem um número válido para iniciar o fluxo.");
      return;
    }
    const quem = active?.nome ?? displayPhone(flowPhone);
    const ok = window.confirm(
      `Iniciar o fluxo “${flow.nome}” com ${quem}? A pessoa recebe agora a mensagem de abertura e a 1ª pergunta, e o robô assume as próximas respostas.`,
    );
    if (ok) startFlowMut.mutate(flow.id);
  };



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

  const timeline = useMemo<InboxMsg[]>(() => {
    const t: InboxMsg[] = [];
    for (const m of convQ.data?.inbound ?? []) {
      const inb = m as {
        id: string; conteudo: string | null; received_at: string; tipo?: string | null;
        media_url?: string | null; media_path?: string | null; media_mime?: string | null; media_filename?: string | null;
        media_size?: number | null;
        wa_message_id?: string | null; reply_to_wa_id?: string | null;
        latitude?: number | null; longitude?: number | null;
        location_name?: string | null; shared_contacts?: { nome?: string | null; phone?: string | null }[] | null;
      };
      t.push({
        id: `in-${inb.id}`, kind: "in", text: inb.conteudo ?? "", at: inb.received_at,
        tipo: inb.tipo ?? null,
        // Caminho + bucket: a URL assinada é gerada e cacheada no cliente, então
        // não muda a cada refetch (áudio não reinicia no meio da reprodução).
        media_path: inb.media_path ?? null,
        media_bucket: inb.media_path ? "inbox-media" : null,
        media_url: inb.media_url ?? null,
        media_mime: inb.media_mime ?? null,
        media_filename: inb.media_filename ?? null,
        media_size: inb.media_size ?? null,

        wa_id: inb.wa_message_id ?? null,
        replyToWaId: inb.reply_to_wa_id ?? null,
        location: inb.latitude != null && inb.longitude != null
          ? { lat: inb.latitude, lng: inb.longitude, name: inb.location_name ?? null }
          : null,
        shared_contacts: inb.shared_contacts ?? null,
      } as InboxMsg & { replyToWaId?: string | null });
    }
    for (const m of convQ.data?.direct ?? []) {
      const row = m as {
        id: string; conteudo?: string; created_at: string; sender_name?: string | null; status: string;
        origem: string; erro?: string | null; delivered_at?: string | null; read_at?: string | null;
        failed_at?: string | null; media_path?: string | null; media_mime?: string | null;
        media_filename?: string | null; message_id?: string | null; endpoint_used?: string | null;
        link_url?: string | null; link_title?: string | null; link_description?: string | null; link_image?: string | null;
      };
      const isFlowBot = row.endpoint_used === "whatsapp-flow";
      t.push({
        id: `d-${row.id}`, kind: "out", text: row.conteudo ?? "", at: row.created_at,
        meta: isFlowBot
          ? `Cadastro pelo chat${row.status === "erro" ? describeSendError(row.erro) : ""}`
          : `${row.sender_name ?? "Você"}${row.status === "erro" ? describeSendError(row.erro) : ""}${row.origem !== "inbox" ? ` · ${row.origem}` : ""}`,
        media_path: row.media_path ?? null,
        media_mime: row.media_mime ?? null,
        media_filename: row.media_filename ?? null,
        wa_id: row.message_id ?? null,
        receipt: receiptFrom(row),
        error: row.erro ?? null,
        link_url: row.link_url ?? null,
        link_title: row.link_title ?? null,
        link_description: row.link_description ?? null,
        link_image: row.link_image ?? null,
      });
    }
    for (const m of convQ.data?.campaign ?? []) t.push({
      id: `c-${m.id}`, kind: "out", text: m.rendered_message ?? "", at: m.sent_at ?? "",
      meta: `campanha · ${m.campaign_name ?? ""}`,
      header_type: m.header_type,
      header_text: m.header_text,
      link_url: m.link_url ?? null,
      link_title: m.link_title ?? null,
      link_description: m.link_description ?? null,
      link_image: m.link_image ?? null,
      buttons: m.buttons,
      isTemplate: (m.buttons?.length ?? 0) > 0 || m.header_type != null,
      wa_id: (m as { message_id?: string | null }).message_id ?? null,
      receipt: receiptFrom({ status: m.status }),
    });
    for (const m of convQ.data?.automation ?? []) t.push({
      id: `a-${m.id}`, kind: "out", text: m.rendered_body ?? "", at: m.sent_at ?? "",
      meta: `automação${m.automation_name ? ` · ${m.automation_name}` : ""}${m.status === "error" ? describeSendError(m.error) : ""}`,
      receipt: receiptFrom({ status: m.status === "error" ? "erro" : m.status }),
      media_path: m.media_path ?? null,
      media_mime: m.media_mime ?? null,
      media_filename: m.media_filename ?? null,
    });
    // Avisos do WhatsApp (chamada, grupo etc.) entram como faixa central, não bolha.
    for (const e of convQ.data?.systemEvents ?? []) {
      if (!e.text) continue;
      t.push({ id: `sys-${e.id}`, kind: "system", text: e.text, at: e.at });
    }
    // Reações ficam coladas na bolha da mensagem reagida, como no WhatsApp.
    const byWaId = new Map<string, InboxMsg>();
    for (const m of t) if (m.wa_id) byWaId.set(m.wa_id, m);
    for (const r of convQ.data?.reactions ?? []) {
      const target = r.target_wa_id ? byWaId.get(r.target_wa_id) : undefined;
      if (target) target.reactions = [...(target.reactions ?? []), r.emoji];
      else t.push({ id: `r-${r.id}`, kind: "in", text: r.emoji, at: r.at, meta: "reação" });
    }
    // Resposta citada: liga a mensagem recebida à original pelo id do WhatsApp.
    for (const m of t) {
      const waRef = (m as InboxMsg & { replyToWaId?: string | null }).replyToWaId;
      if (!waRef) continue;
      const orig = byWaId.get(waRef);
      if (orig) m.reply = { id: orig.id, kind: orig.kind === "out" ? "out" : "in", text: orig.text };
    }
    // Conversa de mecanismo antigo sem detalhe em nenhuma das 4 fontes — só
    // entra quando não sobrou nenhum item de verdade, pra não competir com
    // histórico real (getConversation já garante isso, mas confere de novo aqui).
    const fb = convQ.data?.fallback_last_message;
    if (t.length === 0 && fb) {
      t.push({
        id: "fallback-last-message",
        kind: fb.direction === "in" ? "in" : "out",
        text: fb.text,
        at: fb.at ?? "",
        meta: "mensagem antiga — detalhe indisponível",
      });
    }
    // Alguma das 4 fontes falhou ao carregar (erro técnico, não "sem histórico")
    // — avisa em vez de mascarar como se a conversa estivesse vazia/completa.
    if ((convQ.data?.source_errors?.length ?? 0) > 0) {
      t.push({
        id: "source-error-warning",
        kind: "system",
        text: "Não foi possível carregar parte do histórico desta conversa (erro técnico). Avise o time técnico.",
        at: new Date().toISOString(),
      });
    }
    return t.sort((a, b) => {
      const ta = new Date(a.at).getTime();
      const tb = new Date(b.at).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) return a.at < b.at ? -1 : 1;
      return ta - tb;
    });
  }, [convQ.data]);

  // Renderização inicial limitada: histórico antigo entra sob demanda.
  const THREAD_PAGE = 50;
  const [visibleCount, setVisibleCount] = useState(THREAD_PAGE);
  useEffect(() => { setVisibleCount(THREAD_PAGE); }, [selectedContactId, selectedConvId]);
  const hiddenOlder = Math.max(0, timeline.length - visibleCount);
  const visibleTimeline = useMemo(
    () => (hiddenOlder > 0 ? timeline.slice(hiddenOlder) : timeline),
    [timeline, hiddenOlder],
  );

  // Divisor de não lidas: primeira mensagem recebida ainda não lida ao abrir.
  const unreadBeforeId = useMemo(() => {
    const n = selected?.unread ?? 0;
    if (n <= 0) return null;
    const incoming = visibleTimeline.filter((m) => m.kind === "in");
    const first = incoming[Math.max(0, incoming.length - n)];
    return first?.id ?? null;
  }, [visibleTimeline, selected?.unread]);

  const timelineItems = useMemo(
    () => buildTimelineItems(visibleTimeline, { unreadBeforeId }),
    [visibleTimeline, unreadBeforeId],
  );

  // Rolagem: só acompanha o fim se o usuário já estiver no fim.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const lastLenRef = useRef(0);

  function scrollThreadToEnd(behavior: ScrollBehavior = "auto") {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    else threadEndRef.current?.scrollIntoView({ block: "end" });
    setNewCount(0);
    setAtBottom(true);
  }

  function onThreadScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(near);
    if (near) setNewCount(0);
  }

  useEffect(() => {
    const prev = lastLenRef.current;
    lastLenRef.current = timeline.length;
    if (timeline.length === 0) return;
    if (prev === 0) { requestAnimationFrame(() => scrollThreadToEnd()); return; }
    if (timeline.length > prev) {
      if (atBottom) requestAnimationFrame(() => scrollThreadToEnd("smooth"));
      else setNewCount((v) => v + (timeline.length - prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.length]);

  useEffect(() => {
    lastLenRef.current = 0;
    setNewCount(0);
    setAtBottom(true);
  }, [selectedContactId, selectedConvId]);

  const emptyListText = useMemo(() => {
    switch (chip) {
      case "aberta": return "Nenhuma conversa em aberto agora.";
      case "aguardando": return "Nada aguardando resposta do contato.";
      case "todas": return "Nenhuma conversa por aqui ainda.";
      case "resolvida": return "Nenhuma conversa resolvida ainda.";
      case "sinalizada": return "Nenhuma conversa sinalizada.";
      case "chat_disponivel": return "Ninguém na janela de 24h agora — nenhuma pessoa escreveu nas últimas 24h.";
      case "expirando": return "Nenhuma janela fechando nas próximas 4 horas.";
      case "minhas": return "Nenhuma conversa atribuída a você.";
      case "ultimo_disparo": return "Nenhum disparo de campanha sem resposta agora.";
      default: return "Nenhuma conversa neste filtro.";
    }
  }, [chip]);




  return (
    <TooltipProvider delayDuration={200}>
      <div className="wa-inbox flex h-full max-h-[100dvh] min-h-0 bg-muted/10">
      {/* LEFT: conversation list */}
      <div className={`${mobilePane === "list" ? "flex" : "hidden"} md:flex w-full md:w-80 lg:w-96 flex-col min-h-0 border-r bg-background`}>
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              ref={searchRef}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSearch("");
                  e.currentTarget.blur();
                }
              }}
              placeholder="Buscar nome, telefone… (atalho: /)"
              className="w-full text-sm pl-8 pr-2 py-2 rounded-md border border-input bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {INBOX_CHIPS.map((f) => {
              const active = chip === f.key;
              return (
                <Tooltip key={f.key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setChip(f.key)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-input hover:bg-muted"
                      }`}
                    >
                      {f.label}
                      {active && (
                        <span className="inline-flex items-center justify-center min-w-[1.125rem] px-1 rounded-full text-[10px] font-semibold bg-primary-foreground/20 text-primary-foreground">
                          {listTotal}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[15rem]">
                    <p>{f.hint}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>Ordenar por</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as InboxSort)}
              className="text-[11px] px-1.5 py-1 rounded border bg-background"
            >
              {INBOX_SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {(pinnedQ.data?.length ?? 0) > 0 && (
            <div className="border-b bg-emerald-50 dark:bg-emerald-950/20">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
                Dentro da janela agora
              </div>
              {(pinnedQ.data ?? []).map((c) => (
                <ConversationRow
                  key={`pinned-${c.id}`}
                  c={c}
                  selected={selectedContactId ? c.contact_id === selectedContactId : selectedConvId === c.id}
                  onOpen={() => openConversation(c.contact_id, c.id, c.unread)}
                />
              ))}
            </div>
          )}
          {listQ.isLoading && (
            <div>{[0, 1, 2, 3, 4].map((i) => <ConversationSkeleton key={i} />)}</div>
          )}
          {listQ.isError && !listQ.isLoading && (
            <div className="p-6 text-center text-sm">
              <p className="text-muted-foreground">Não foi possível carregar as conversas.</p>
              <button
                onClick={() => listQ.refetch()}
                className="mt-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
              >
                Tentar de novo
              </button>
            </div>
          )}
          {list.length === 0 && !listQ.isLoading && !listQ.isError && (
            <div className="p-6 text-center text-sm text-muted-foreground">{emptyListText}</div>
          )}
          {list.length > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b">
              {list.length} de {listTotal} carregadas
              {listCapped && " (mostrando as mais recentes)"}
            </div>
          )}
          {list.map((c) => (
            <ConversationRow
              key={c.id}
              c={c}
              selected={selectedContactId ? c.contact_id === selectedContactId : selectedConvId === c.id}
              onOpen={() => openConversation(c.contact_id, c.id, c.unread)}
            />
          ))}

          {hasMore && (
            <div ref={loadMoreRef} className="p-3">
              <button
                onClick={() => listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
                className="w-full text-xs inline-flex items-center justify-center gap-2 px-3 py-2 border rounded-md hover:bg-muted disabled:opacity-50"
              >
                {listQ.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
                Carregar mais conversas
              </button>
            </div>
          )}

          {search.trim().length >= 2 && (searchNewQ.data?.length ?? 0) > 0 && (
            <div className="border-t bg-muted/10">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                Iniciar nova conversa
              </div>
              {(searchNewQ.data ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id, null, 0)}
                  className="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-background/50"
                >
                  <InboxAvatar name={c.nome ?? c.phone} seed={c.id} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.nome ?? "Sem nome"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.phone}{c.cidade ? ` · ${c.cidade}/${c.uf ?? ""}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* CENTER: thread */}
      <div className={`${mobilePane === "thread" ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0 min-h-0`}>
        {!active ? (
          <div className="flex-1 grid place-items-center text-center text-sm text-muted-foreground p-8">
            <div>
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
              {selectedContactId ? "Carregando conversa…" : "Selecione uma conversa para começar."}
            </div>
          </div>
        ) : (
          <>
            <div className="wa-topbar border-b p-3 flex items-center gap-2 bg-background">
              <button className="md:hidden" onClick={() => setMobilePane("list")} aria-label="Voltar para a lista">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <InboxAvatar
                name={active.nome ?? active.phone}
                seed={active.contact_id ?? conv?.id ?? ""}
                size={38}
              />
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
                  {conv && (
                    <WindowBadge lastInboundAt={(conv as { last_inbound_at?: string | null }).last_inbound_at ?? null} />
                  )}
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
                  onClick={() => conv && unreadMut.mutate({ conversation_id: conv.id })}
                  className="hidden sm:inline-flex text-xs items-center gap-1 px-2 py-1.5 border rounded-md hover:bg-muted"
                  aria-label="Marcar conversa como não lida"
                  title="Marcar como não lida (atalho: U) — volta para a fila de não lidas"
                >
                  <MessageSquareText className="h-3 w-3" /> Não lida
                </button>
                <button
                  onClick={() => conv && statusMut.mutate({ conversation_id: conv.id, status: conv.status === "resolvida" ? "aberta" : "resolvida" })}
                  className="text-xs inline-flex items-center gap-1 px-2 py-1.5 border rounded-md hover:bg-muted"
                  aria-label={conv?.status === "resolvida" ? "Reabrir conversa" : "Marcar conversa como resolvida"}
                >
                  {conv?.status === "resolvida" ? <><RotateCcw className="h-3 w-3" /> Reabrir</> : <><CheckCircle2 className="h-3 w-3" /> Resolver</>}
                </button>
                {conv?.status !== "resolvida" && (
                  <button
                    onClick={resolveAndNext}
                    className="hidden md:inline-flex text-xs items-center gap-1 px-2 py-1.5 border rounded-md bg-primary text-primary-foreground hover:opacity-90"
                    title="Resolver esta conversa e abrir a próxima da lista (atalho: E)"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Resolver e próxima
                  </button>
                )}
                {contact && !contact.opt_out_at && (
                  <button
                    onClick={archiveAndOptOutAndNext}
                    disabled={archiveOptOutMut.isPending}
                    className="hidden md:inline-flex text-xs items-center gap-1 px-2 py-1.5 border border-destructive rounded-md text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                    title="Marcar como opt-out e arquivar a conversa (some do Inbox)"
                  >
                    <Ban className="h-3 w-3" /> Opt-out
                  </button>
                )}

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

            <div
              ref={scrollerRef}
              onScroll={onThreadScroll}
              className="wa-chat-area relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-4"
            >
              {convQ.isLoading && (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                      <div className="h-12 w-1/2 animate-pulse rounded-2xl bg-muted" />
                    </div>
                  ))}
                </div>
              )}
              {timeline.length === 0 && !convQ.isLoading && (
                <div className="py-8 text-center text-sm text-muted-foreground">Sem mensagens ainda. Envie a primeira!</div>
              )}

              {hiddenOlder > 0 && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((v) => v + THREAD_PAGE)}
                    className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                  >
                    Carregar mensagens anteriores ({hiddenOlder})
                  </button>
                </div>
              )}

              {timelineItems.map((item) => {
                if (item.type === "day") return <DaySeparator key={item.id} label={item.label} />;
                if (item.type === "unread") return <UnreadDivider key={item.id} />;
                if (item.msg.kind === "system") {
                  return <SystemMessage key={item.id} text={item.msg.text} at={item.msg.at} />;
                }
                return (
                  <MessageBubble
                    key={item.id}
                    msg={item.msg}
                    groupStart={item.groupStart}
                    groupEnd={item.groupEnd}
                    onQuoteClick={(id) => {
                      const el = document.getElementById(`msg-${id}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      el?.classList.add("ring-2", "ring-primary/60");
                      window.setTimeout(() => el?.classList.remove("ring-2", "ring-primary/60"), 1200);
                    }}
                    onReply={(m) => {
                      setReply((prev) => {
                        const quote = m.text ? `> ${m.text.slice(0, 200)}\n` : "";
                        return prev ? `${quote}${prev}` : quote;
                      });
                      replyRef.current?.focus();
                    }}
                  />
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {!atBottom && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => scrollThreadToEnd("smooth")}
                  className="absolute bottom-2 right-4 z-10 inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs shadow-md hover:bg-muted"
                >
                  {newCount > 0 ? `${newCount} nova${newCount > 1 ? "s" : ""} mensagem${newCount > 1 ? "s" : ""} ↓` : "Ir para a última mensagem ↓"}
                </button>
              </div>
            )}


            {conv && !conv.contact_id && (
              <UnlinkedBanner
                phone={conv.from_phone ?? ""}
                onQuick={() => setQuickCreateOpen(true)}
                onLink={(contact_id) =>
                  linkMut.mutate({ conversation_id: conv.id, contact_id })
                }
              />
            )}

            <div className="border-t p-3 bg-background space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {!canSend && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                  {contact?.opt_out_at
                    ? "Contato optou por sair (opt-out). Envio bloqueado."
                    : conv && !conv.contact_id
                      ? "Conversa sem telefone válido — não é possível responder."
                      : "Contato sem WhatsApp válido."}
                </div>
              )}
              {canSend && !windowOpen && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-md p-2">
                  <span>
                    Fora da janela de 24h do WhatsApp: texto livre não chega mais nessa conversa
                    (a pessoa precisa escrever de novo pra reabrir). Envie um template aprovado —
                    a resposta dela reabre a janela.
                  </span>
                  {contact && (
                    <Button size="sm" variant="secondary" onClick={() => setTemplateSendOpen(true)}>
                      Enviar template oficial
                    </Button>
                  )}
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
                  ) : AUDIO_MIME_TYPES.includes(attachment.mime) ? (
                    <Music className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="truncate font-medium">{attachment.filename}</div>
                    <div className="text-muted-foreground truncate">
                      {[attachment.mime.split("/").pop()?.toUpperCase(), fmtBytes(attachment.size)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button onClick={clearAttachment} className="p-1 rounded hover:bg-background" title="Remover anexo" aria-label="Remover anexo">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {pendingButtons && pendingButtons.length > 0 && (
                <div className="flex items-center gap-2 border rounded-md p-2 bg-muted/40">
                  <div className="flex-1 min-w-0 flex flex-wrap gap-1 text-xs">
                    {pendingButtons.map((b, i) => (
                      <span key={i} className="rounded-full border bg-background px-2 py-0.5 truncate max-w-[10rem]">{b.text}</span>
                    ))}
                  </div>
                  <button onClick={() => setPendingButtons(null)} className="p-1 rounded hover:bg-background" title="Remover botões" aria-label="Remover botões">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {uploading && (
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept={fileAccept}
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
                <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="p-2 rounded-md hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-40"
                      title="Anexar arquivo"
                      aria-label="Anexar arquivo"
                      disabled={!canSendFreeText || uploading}
                      type="button"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-52 p-1" sideOffset={8}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setFileAccept("image/png,image/jpeg,image/jpg,image/webp");
                        setAttachOpen(false);
                        requestAnimationFrame(() => fileInputRef.current?.click());
                      }}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-100 text-violet-700">
                        <ImageIcon className="h-3.5 w-3.5" />
                      </span>
                      Foto
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setFileAccept("application/pdf");
                        setAttachOpen(false);
                        requestAnimationFrame(() => fileInputRef.current?.click());
                      }}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-100 text-sky-700">
                        <FileText className="h-3.5 w-3.5" />
                      </span>
                      Documento (PDF)
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setFileAccept(AUDIO_ACCEPT);
                        setAttachOpen(false);
                        requestAnimationFrame(() => fileInputRef.current?.click());
                      }}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                        <Music className="h-3.5 w-3.5" />
                      </span>
                      Áudio
                    </button>
                  </PopoverContent>
                </Popover>

                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="p-2 rounded-md hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-40"
                      title="Inserir emoji"
                      disabled={!canSendFreeText}
                      type="button"
                    >
                      <Smile className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-0" sideOffset={8}>
                    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando emojis…</div>}>
                      <EmojiPicker
                        onEmojiClick={(data) => {
                          const emoji = typeof data.emoji === "string" ? data.emoji : "";
                          if (!emoji) return;
                          const el = replyRef.current;
                          const start = el ? el.selectionStart ?? cursorRef.current.start : cursorRef.current.start;
                          const end = el ? el.selectionEnd ?? cursorRef.current.end : cursorRef.current.end;
                          const before = reply.slice(0, start);
                          const after = reply.slice(end);
                          const next = before + emoji + after;
                          setReply(next);
                          const pos = start + emoji.length;
                          cursorRef.current = { start: pos, end: pos };
                          requestAnimationFrame(() => {
                            el?.focus();
                            el?.setSelectionRange(pos, pos);
                          });
                          setEmojiOpen(false);
                        }}
                        width={280}
                        height={320}
                        lazyLoadEmojis
                        searchDisabled
                      />
                    </Suspense>
                  </PopoverContent>
                </Popover>
                {tplsQ.data && tplsQ.data.length > 0 && (
                  <Popover open={quickOpen} onOpenChange={(o) => { setQuickOpen(o); if (!o) setQuickSearch(""); }}>
                    <PopoverTrigger asChild>
                      <button
                        className="p-2 rounded-md hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-40"
                        title="Resposta rápida"
                        disabled={!canSendFreeText}
                        type="button"
                      >
                        <MessageSquareText className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
                      <div className="p-2 border-b">
                        <input
                          value={quickSearch}
                          onChange={(e) => setQuickSearch(e.target.value)}
                          placeholder="Buscar resposta rápida…"
                          className="w-full text-sm px-2 py-1.5 rounded-md border bg-background"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto p-1">
                        {filteredQuickReplies.length === 0 && (
                          <div className="p-3 text-xs text-muted-foreground">Nenhuma resposta rápida encontrada.</div>
                        )}
                        {filteredQuickReplies.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left px-2 py-2 rounded-md hover:bg-muted"
                            onClick={() => {
                              setReply((prev) => (prev ? prev + "\n" + t.body : t.body));
                              // Se a resposta pronta tem arquivo salvo, ele entra como anexo pendente.
                              if (t.media_path) {
                                setAttachment((prev) => {
                                  if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
                                  return {
                                    path: t.media_path as string,
                                    mime: (t.media_mime as string | null) ?? "application/octet-stream",
                                    filename: (t.media_filename as string | null)
                                      ?? (t.media_path as string).split("/").pop()
                                      ?? "arquivo",
                                  };
                                });
                                setPendingButtons(null); // anexo e botões são mutuamente exclusivos
                              } else {
                                const btns = Array.isArray(t.buttons) ? t.buttons : [];
                                if (btns.length > 0) {
                                  setPendingButtons(btns.map((b) => ({ text: (b as { text: string }).text })));
                                }
                              }
                              setQuickOpen(false);
                              setQuickSearch("");
                              requestAnimationFrame(() => replyRef.current?.focus());
                            }}
                          >
                            <div className="text-sm font-medium truncate flex items-center gap-1">
                              {t.media_path && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                              <span className="truncate">{t.title}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground line-clamp-2">{t.body}</div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {(flowsQ.data?.flows ?? []).some((f) => f.active) && (
                  <Popover open={flowOpen} onOpenChange={(o) => { setFlowOpen(o); if (!o) setFlowSearch(""); }}>
                    <PopoverTrigger asChild>
                      <button
                        className="p-2 rounded-md hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-40"
                        title={
                          windowOpen
                            ? "Iniciar fluxo de cadastro (robô)"
                            : "Só é possível iniciar o fluxo até 24h depois da última mensagem da pessoa"
                        }
                        disabled={!canSend || !windowOpen || startFlowMut.isPending}
                        type="button"
                      >
                        {startFlowMut.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Bot className="h-4 w-4" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
                      <div className="p-2 border-b">
                        <div className="text-xs font-medium mb-1.5">Iniciar fluxo de cadastro</div>
                        <input
                          value={flowSearch}
                          onChange={(e) => setFlowSearch(e.target.value)}
                          placeholder="Buscar fluxo…"
                          className="w-full text-sm px-2 py-1.5 rounded-md border bg-background"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto p-1">
                        {activeFlows.length === 0 && (
                          <div className="p-3 text-xs text-muted-foreground">
                            Nenhum fluxo ligado. Ligue um em “Cadastro pelo WhatsApp”.
                          </div>
                        )}
                        {activeFlows.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className="w-full text-left px-2 py-2 rounded-md hover:bg-muted"
                            onClick={() => {
                              setFlowOpen(false);
                              setFlowSearch("");
                              startFlow(f);
                            }}
                          >
                            <div className="text-sm font-medium truncate">{f.nome}</div>
                            {f.descricao && (
                              <div className="text-[11px] text-muted-foreground line-clamp-2">
                                {f.descricao}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="border-t p-2 text-[11px] text-muted-foreground">
                        O robô assume a conversa até concluir o cadastro ou a pessoa pedir
                        atendimento humano.
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <textarea
                  ref={replyRef}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleSendKeyDown}
                  onClick={(e) => {
                    cursorRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
                  }}
                  onKeyUp={(e) => {
                    cursorRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
                  }}
                  onSelect={(e) => {
                    cursorRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
                  }}
                  disabled={!canSendFreeText}
                  rows={1}
                  placeholder={
                    canSend && !windowOpen
                      ? "Fora da janela de 24h — envie um template aprovado para reabrir"
                      : "Escreva uma mensagem (Enter envia · Shift+Enter quebra linha)"
                  }
                  className="flex-1 min-w-0 text-sm px-3 py-2 rounded-md border bg-background resize-none max-h-40 overflow-y-auto"
                  style={{ minHeight: "40px" }}
                />
                <button
                  onClick={submitReply}
                  disabled={!canSendFreeText || (!reply.trim() && !attachment) || sendMut.isPending}
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
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-muted-foreground">Formas de ajuda:</span>
                  {savedFlash === "formas_ajuda" && <Check className="h-3 w-3 text-emerald-600" />}
                </div>
                <div className="space-y-1">
                  {FORMAS_AJUDA_OPTIONS.map((opt) => {
                    const current = Array.isArray(contact.formas_ajuda) ? contact.formas_ajuda : [];
                    const checked = current.includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          disabled={formasAjudaMut.isPending}
                          onCheckedChange={(v) => {
                            const next = v === true
                              ? [...current, opt.value]
                              : current.filter((f) => f !== opt.value);
                            formasAjudaMut.mutate({ contact_id: contact.id, formas_ajuda: next });
                          }}
                        />
                        <span className="text-[11px]">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-muted-foreground">Tags:</span>
                  {savedFlash === "tags" && <Check className="h-3 w-3 text-emerald-600" />}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(convQ.data?.tags ?? []).map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border"
                      style={t.cor ? { borderColor: t.cor, color: t.cor } : undefined}
                    >
                      {t.nome}
                      <button
                        type="button"
                        onClick={() => removeTagMut.mutate({ contact_id: contact.id, tag_id: t.id })}
                        className="hover:opacity-70"
                        aria-label={`Remover tag ${t.nome}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <ContactTagPicker
                    excludeIds={(convQ.data?.tags ?? []).map((t) => t.id)}
                    onPick={(tag: InboxTagRow) => addTagMut.mutate({ contact_id: contact.id, tag_id: tag.id })}
                    onCreated={(tag: InboxTagRow) => addTagMut.mutate({ contact_id: contact.id, tag_id: tag.id })}
                  />
                </div>
              </div>
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
              <button
                type="button"
                onClick={copyContactFormatted}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] px-2 py-1.5 rounded border hover:bg-muted"
              >
                {copiedContact ? (
                  <><Check className="h-3 w-3" /> Copiado</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copiar dados formatados</>
                )}
              </button>
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
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role}){s.has_whatsapp ? "" : " — sem WhatsApp"}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Quem tem WhatsApp vinculado recebe um aviso automático ao ser escolhido.
              </p>
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

      {contact && (
        <SendWhatsAppWizard
          open={templateSendOpen}
          onOpenChange={setTemplateSendOpen}
          source={{ ids: [contact.id] }}
          labelSelecao={active?.nome ?? "este contato"}
        />
      )}
    </div>
    </TooltipProvider>
  );
}

function describeEvent(e: {
  event_type: string;
  payload: Record<string, string | number | boolean | null>;
}) {
  switch (e.event_type) {
    case "assigned":
      return "Conversa atribuída";
    case "unassigned":
      return "Atribuição removida";
    case "status_changed":
      return `Status: ${e.payload.from ?? "?"} → ${e.payload.to ?? "?"}`;
    case "note":
      return "Nota interna adicionada";
    case "mention":
      return "Mencionou um colega";
    case "flagged":
      return "Marcada como importante";
    case "unflagged":
      return "Removida a marcação";
    case "archived":
      return "Contato marcado como opt-out e conversa arquivada";
    default:
      return e.event_type;
  }
}

function fmtDate(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
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

