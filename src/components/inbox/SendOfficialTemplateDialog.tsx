import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listWhatsappTemplates } from "@/lib/whatsapp-templates.functions";
import { sendOfficialTemplateFromInbox } from "@/lib/communication.functions";
import { renderMessageVars } from "@/lib/message-vars";
import { MessagePreview } from "@/components/MessagePreview";

type PreviewContact = {
  nome?: string | null;
  cidade?: string | null;
  bairro?: string | null;
  uf?: string | null;
};

/**
 * Etapa 6 — envio avulso de um template oficial aprovado, direto do Inbox,
 * sem passar pelo wizard de campanha (SendWhatsAppWizard): sem passo de
 * público/agendamento/anexo, sem criar campaigns/campaign_recipients por
 * baixo. Um único contato, um template, "Enviar agora".
 */
export function SendOfficialTemplateDialog({
  open,
  onOpenChange,
  contactId,
  contact,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contact: PreviewContact | null | undefined;
  onSent: () => void;
}) {
  const templatesFn = useServerFn(listWhatsappTemplates);
  const sendFn = useServerFn(sendOfficialTemplateFromInbox);
  const [templateId, setTemplateId] = useState("");

  const templatesQ = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => templatesFn(),
    enabled: open,
  });
  const officialTemplates = useMemo(
    () =>
      (templatesQ.data?.templates ?? []).filter(
        (t) => t.status === "approved" && t.parameter_format === "named",
      ),
    [templatesQ.data],
  );

  useEffect(() => {
    if (!open) setTemplateId("");
  }, [open]);

  const selected = officialTemplates.find((t) => t.id === templateId) ?? null;

  const previewText = useMemo(() => {
    if (!selected) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const opts = { origin, unknownAsEmpty: true } as const;
    const body = renderMessageVars(selected.body_text, contact ?? {}, opts);
    const header =
      selected.header_type === "TEXT" && selected.header_text
        ? renderMessageVars(selected.header_text, contact ?? {}, opts)
        : null;
    return header ? `${header}\n\n${body}` : body;
  }, [selected, contact]);

  const sendMut = useMutation({
    mutationFn: () => sendFn({ data: { contact_id: contactId, whatsapp_template_id: templateId } }),
    onSuccess: () => {
      toast.success("Template enviado");
      onOpenChange(false);
      onSent();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar template"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> Enviar template oficial
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Template aprovado</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={templatesQ.isLoading}
            >
              <option value="">— escolher —</option>
              {officialTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {!templatesQ.isLoading && officialTemplates.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Nenhum template aprovado com variáveis nomeadas disponível ainda.
              </p>
            )}
          </div>

          {selected && (
            <MessagePreview
              text={previewText}
              buttons={selected.buttons}
              recipientLabel={contact?.nome ? `Para ${contact.nome}` : undefined}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => sendMut.mutate()} disabled={!templateId || sendMut.isPending}>
            {sendMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Enviar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
