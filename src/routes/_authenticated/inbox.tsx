import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import {
  listInboxConversations, getInboxConversation, markInboxRead,
  resolveInbox, sendDirectMessage, listQuickReplies,
} from "@/lib/inbox.functions";
import { Inbox as InboxIcon, Search, CheckCircle2, RotateCcw, Send, Loader2, MessageSquare, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Respostas WhatsApp" }] }),
  component: InboxPage,
});

type Conv = {
  key: string;
  contact_id: string | null;
  nome: string | null;
  phone: string | null;
  cidade: string | null;
  uf: string | null;
  last_message: string;
  last_at: string;
  unread_count: number;
  total: number;
  opt_out: boolean;
};

function InboxPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "resolved">("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const qc = useQueryClient();

  const listFn = useServerFn(listInboxConversations);
  const readFn = useServerFn(markInboxRead);
  const resolveFn = useServerFn(resolveInbox);
  const sendFn = useServerFn(sendDirectMessage);
  const convFn = useServerFn(getInboxConversation);
  const tplsFn = useServerFn(listQuickReplies);

  const listQ = useQuery({
    queryKey: ["inbox-list", filter, search],
    queryFn: () => listFn({ data: { filter, search: search || undefined } }),
    refetchInterval: 15000,
  });

  const list: Conv[] = listQ.data ?? [];
  const selected = useMemo(() => list.find((c) => c.key === selectedKey) ?? list[0] ?? null, [list, selectedKey]);

  const convQ = useQuery({
    queryKey: ["inbox-conv", selected?.contact_id, selected?.phone],
    queryFn: () => convFn({ data: { contact_id: selected?.contact_id ?? undefined, phone: !selected?.contact_id ? (selected?.phone ?? undefined) : undefined } }),
    enabled: Boolean(selected),
  });

  const tplsQ = useQuery({ queryKey: ["inbox-tpls"], queryFn: () => tplsFn() });

  const readMut = useMutation({
    mutationFn: (v: { contact_id?: string; phone?: string }) => readFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox-list"] }),
  });

  const resolveMut = useMutation({
    mutationFn: (v: { contact_id?: string; phone?: string; resolved: boolean }) => resolveFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-list"] });
      qc.invalidateQueries({ queryKey: ["inbox-conv"] });
      toast.success("Conversa atualizada");
    },
  });

  const sendMut = useMutation({
    mutationFn: (v: { contact_id: string; message: string; template_id?: string }) =>
      sendFn({ data: { ...v, origem: "inbox" } }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["inbox-conv"] });
      qc.invalidateQueries({ queryKey: ["inbox-list"] });
      toast.success("Mensagem enviada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  function openConversation(c: Conv) {
    setSelectedKey(c.key);
    if (c.unread_count > 0) {
      readMut.mutate({ contact_id: c.contact_id ?? undefined, phone: !c.contact_id ? (c.phone ?? undefined) : undefined });
    }
  }

  const contact = convQ.data?.contact;
  const canSend = Boolean(contact && !contact.opt_out_at && (contact.phone_e164 || contact.phone_whatsapp_candidate));

  // Merge inbound + direct + campaign into timeline
  const timeline = useMemo(() => {
    const t: Array<{ id: string; kind: "in" | "out"; text: string; at: string; meta?: string }> = [];
    for (const m of convQ.data?.inbound ?? []) t.push({ id: `in-${m.id}`, kind: "in", text: m.conteudo ?? "", at: m.received_at });
    for (const m of convQ.data?.direct ?? []) t.push({ id: `d-${m.id}`, kind: "out", text: m.conteudo, at: m.created_at, meta: `avulsa · ${m.origem}${m.status === "erro" ? " · erro" : ""}` });
    for (const m of convQ.data?.campaign ?? []) t.push({ id: `c-${m.id}`, kind: "out", text: m.rendered_message ?? "", at: m.sent_at ?? "", meta: `campanha · ${m.campaign_name ?? ""}` });
    return t.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [convQ.data]);

  return (
    <div className="flex h-screen">
      {/* Left: list */}
      <div className="w-80 border-r flex flex-col bg-muted/10">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center gap-2">
            <InboxIcon className="h-5 w-5 text-primary" />
            <h1 className="font-semibold">Inbox</h1>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone…"
              className="w-full text-sm pl-7 pr-2 py-1.5 rounded-md border border-input bg-background"
            />
          </div>
          <div className="flex text-xs gap-1">
            {(["all", "unread", "resolved"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-2 py-1 rounded-md ${filter === f ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                {f === "all" ? "Abertas" : f === "unread" ? "Não lidas" : "Resolvidas"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listQ.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
          {list.length === 0 && !listQ.isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa nesse filtro.</div>
          )}
          {list.map((c) => (
            <button key={c.key} onClick={() => openConversation(c)}
              className={`w-full text-left px-3 py-2 border-b hover:bg-muted/40 ${selected?.key === c.key ? "bg-muted/60" : ""}`}>
              <div className="flex justify-between items-baseline gap-2">
                <div className="font-medium text-sm truncate">{c.nome ?? c.phone ?? "Sem nome"}</div>
                <div className="text-[10px] text-muted-foreground shrink-0">{fmtRel(c.last_at)}</div>
              </div>
              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                {c.unread_count > 0 && <span className="inline-flex bg-primary text-primary-foreground rounded-full text-[10px] px-1.5 min-w-[1rem] justify-center">{c.unread_count}</span>}
                {c.last_message}
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">{c.phone}{c.cidade ? ` · ${c.cidade}/${c.uf ?? ""}` : ""}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Center: conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="border-b p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{selected.nome ?? selected.phone ?? "Sem nome"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selected.phone}{selected.cidade ? ` · ${selected.cidade}/${selected.uf ?? ""}` : ""}
                  {selected.opt_out && <span className="ml-2 inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> opt-out</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.contact_id && (
                  <Link to="/contatos/$id" params={{ id: selected.contact_id }}
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 border rounded-md hover:bg-muted">
                    <ExternalLink className="h-3 w-3" /> Ver ficha
                  </Link>
                )}
                <button onClick={() => resolveMut.mutate({
                  contact_id: selected.contact_id ?? undefined,
                  phone: !selected.contact_id ? (selected.phone ?? undefined) : undefined,
                  resolved: filter !== "resolved",
                })} className="text-xs inline-flex items-center gap-1 px-2 py-1 border rounded-md hover:bg-muted">
                  {filter === "resolved" ? <><RotateCcw className="h-3 w-3" /> Reabrir</> : <><CheckCircle2 className="h-3 w-3" /> Resolver</>}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {convQ.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
              {timeline.map((m) => (
                <div key={m.id} className={`flex ${m.kind === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${m.kind === "out" ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className={`text-[10px] mt-1 opacity-70`}>{fmtDate(m.at)}{m.meta ? ` · ${m.meta}` : ""}</div>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && !convQ.isLoading && (
                <div className="text-center text-sm text-muted-foreground">Sem mensagens.</div>
              )}
            </div>

            <div className="border-t p-3 space-y-2 bg-background">
              {!canSend && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  {contact?.opt_out_at ? "Contato optou por sair (opt-out). Envio bloqueado." :
                   !selected.contact_id ? "Este número ainda não está vinculado a um contato do CRM. Cadastre para poder responder pela Z-API." :
                   "Contato sem WhatsApp válido."}
                </div>
              )}
              {tplsQ.data && tplsQ.data.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  <select
                    onChange={(e) => {
                      const t = tplsQ.data?.find((x) => x.id === e.target.value);
                      if (t) setReply(t.body);
                      e.currentTarget.value = "";
                    }}
                    className="text-xs px-2 py-1 rounded border bg-background">
                    <option value="">Resposta pronta…</option>
                    {tplsQ.data.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={reply} onChange={(e) => setReply(e.target.value)}
                  disabled={!canSend}
                  rows={2}
                  placeholder="Escreva a resposta… (variáveis: {{nome}}, {{primeiro_nome}}, {{cidade}}, {{bairro}})"
                  className="flex-1 text-sm px-3 py-2 rounded-md border bg-background resize-none"
                />
                <button
                  onClick={() => selected.contact_id && sendMut.mutate({ contact_id: selected.contact_id, message: reply })}
                  disabled={!canSend || !reply.trim() || sendMut.isPending}
                  className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-1 disabled:opacity-40">
                  {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar
                </button>
              </div>
              {selected.phone && (
                <a href={`https://wa.me/${(selected.phone ?? "").replace(/\D+/g, "")}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Abrir no WhatsApp pessoal
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function fmtRel(iso: string) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
