// Modal "Mandar jornada" (só no painel do admin): mostra o cartão de desempenho
// geral da pessoa + a legenda pronta, para compartilhar direto no WhatsApp.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShareCardActions } from "@/components/impact/ShareCardActions";
import { getImpactStatsForUser } from "@/lib/impact-stats.functions";

export function SendJourneyDialog({
  open,
  onOpenChange,
  userId,
  nome,
  whatsapp,
  legenda,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  nome: string;
  whatsapp: string | null;
  legenda: string;
}) {
  const fetchFn = useServerFn(getImpactStatsForUser);
  const q = useQuery({
    queryKey: ["impact-stats", userId],
    queryFn: () => fetchFn({ data: { userId } }),
    enabled: open,
  });

  const waLink = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(legenda)}`
    : `https://wa.me/?text=${encodeURIComponent(legenda)}`;

  async function copiarLegenda() {
    try {
      await navigator.clipboard.writeText(legenda);
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mandar jornada de {nome}</DialogTitle>
          <DialogDescription>
            Compartilhe a imagem do desempenho geral junto com a legenda. No celular, o botão
            abaixo abre direto o WhatsApp com a imagem anexada.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Montando o cartão…
          </p>
        )}
        {q.isError && (
          <p className="text-sm text-destructive">
            Não foi possível carregar os números dessa pessoa agora.
          </p>
        )}

        {q.data && (
          <ShareCardActions
            stats={q.data}
            variant="total"
            preview
            shareText={legenda}
            shareLabel="Compartilhar imagem + legenda"
            filename={`jornada-${nome.split(" ")[0]?.toLowerCase() ?? "agitador"}.png`}
          />
        )}

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Legenda que vai junto</p>
          <p className="whitespace-pre-wrap text-sm">{legenda}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => void copiarLegenda()}>
              <Copy className="mr-2 h-4 w-4" /> Copiar legenda
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1">
              <a href={waLink} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {whatsapp ? "Abrir conversa no WhatsApp" : "Abrir WhatsApp"}
              </a>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            No computador, o WhatsApp não aceita anexo automático: use “Baixar imagem” e anexe na
            conversa junto com a legenda.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
