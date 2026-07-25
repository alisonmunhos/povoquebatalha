import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createNotification } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUserRole } from "@/hooks/use-current-role";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/agitacao-notificacoes")({
  head: () => ({ meta: [{ title: "Central de Notificações — Povo que Batalha" }] }),
  component: NotificacoesAdminPage,
});

type CtaKind = "none" | "wa_me" | "link" | "calendar";

function NotificacoesAdminPage() {
  const role = useCurrentUserRole();
  const createFn = useServerFn(createNotification);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ctaKind, setCtaKind] = useState<CtaKind>("none");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaPhone, setCtaPhone] = useState("");
  const [ctaMessage, setCtaMessage] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [calTitle, setCalTitle] = useState("");
  const [calStart, setCalStart] = useState("");
  const [calEnd, setCalEnd] = useState("");
  const [calLocation, setCalLocation] = useState("");
  const [targetMode, setTargetMode] = useState<"all_staff" | "role">("all_staff");
  const [targetRole, setTargetRole] = useState<"admin" | "moderator" | "agitador">("agitador");

  const historyQ = useQuery({
    queryKey: ["notif-admin-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, kind, created_at, created_by")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      if (ctaKind === "wa_me") {
        payload.phone = ctaPhone.replace(/\D/g, "");
        payload.message = ctaMessage;
      } else if (ctaKind === "link") {
        payload.url = ctaUrl;
      } else if (ctaKind === "calendar") {
        payload.title = calTitle || title;
        payload.start = calStart ? new Date(calStart).toISOString() : new Date().toISOString();
        payload.end = calEnd ? new Date(calEnd).toISOString() : new Date(Date.now() + 3600_000).toISOString();
        payload.location = calLocation;
      }
      return createFn({
        data: {
          title,
          body: body || null,
          image_url: imageUrl || null,
          kind: "custom",
          cta_kind: ctaKind === "none" ? null : ctaKind,
          cta_label: ctaKind === "none" ? null : ctaLabel || "Abrir",
          cta_payload: payload,
          target:
            targetMode === "all_staff"
              ? { mode: "all_staff" }
              : { mode: "role", role: targetRole },
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Notificação enviada para ${res.inserted} pessoa(s).`);
      setTitle("");
      setBody("");
      setImageUrl("");
      setCtaLabel("");
      setCtaPhone("");
      setCtaMessage("");
      setCtaUrl("");
      setCalTitle("");
      setCalStart("");
      setCalEnd("");
      setCalLocation("");
      historyQ.refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (role !== "admin" && role !== "moderator") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-muted-foreground">Acesso restrito a admin/moderador.</p>
      </div>
    );
  }

  const canSubmit = title.trim().length > 0 && !sendMut.isPending;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl">Central de Notificações</h1>
        <p className="text-sm text-muted-foreground">
          Envie avisos direto pro sino da equipe. Aparecem em tempo real.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex: Missão nova disponível" />
        </div>
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} />
        </div>
        <div className="space-y-2">
          <Label>Imagem (URL, opcional)</Label>
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="space-y-2">
          <Label>Ação do botão</Label>
          <Select value={ctaKind} onValueChange={(v) => setCtaKind(v as CtaKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem botão</SelectItem>
              <SelectItem value="wa_me">Abrir WhatsApp (wa.me)</SelectItem>
              <SelectItem value="link">Abrir link</SelectItem>
              <SelectItem value="calendar">Adicionar à agenda (.ics)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {ctaKind !== "none" && (
          <div className="space-y-2">
            <Label>Texto do botão</Label>
            <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Abrir" />
          </div>
        )}

        {ctaKind === "wa_me" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Telefone (com DDI)</Label>
              <Input value={ctaPhone} onChange={(e) => setCtaPhone(e.target.value)} placeholder="+5551..." />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Mensagem pré-preenchida</Label>
              <Textarea value={ctaMessage} onChange={(e) => setCtaMessage(e.target.value)} rows={3} />
            </div>
          </div>
        )}

        {ctaKind === "link" && (
          <div className="space-y-2">
            <Label>URL de destino</Label>
            <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
          </div>
        )}

        {ctaKind === "calendar" && (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Título do evento</Label>
              <Input value={calTitle} onChange={(e) => setCalTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="datetime-local" value={calStart} onChange={(e) => setCalStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="datetime-local" value={calEnd} onChange={(e) => setCalEnd(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Local</Label>
              <Input value={calLocation} onChange={(e) => setCalLocation(e.target.value)} />
            </div>
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          <Label>Enviar para</Label>
          <Select value={targetMode} onValueChange={(v) => setTargetMode(v as "all_staff" | "role")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all_staff">Todo mundo (admin, moderador e agitador)</SelectItem>
              <SelectItem value="role">Papel específico</SelectItem>
            </SelectContent>
          </Select>
          {targetMode === "role" && (
            <Select value={targetRole} onValueChange={(v) => setTargetRole(v as typeof targetRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agitador">Agitadores</SelectItem>
                <SelectItem value="moderator">Moderadores</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <Button onClick={() => sendMut.mutate()} disabled={!canSubmit} className="w-full">
          {sendMut.isPending ? "Enviando…" : "Enviar notificação"}
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold mb-3">Últimas notificações enviadas</h2>
        {historyQ.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {historyQ.data && historyQ.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>
        )}
        <ul className="space-y-2 text-sm">
          {(historyQ.data ?? []).map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-2 border-b last:border-b-0 pb-2">
              <span className="truncate">{n.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(n.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
