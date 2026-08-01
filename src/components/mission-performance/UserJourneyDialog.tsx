// Modal do admin: vê e baixa/compartilha a "jornada" (cartão de patamar) de um agitador.
// Só números agregados — nenhum dado de contato da base aparece aqui.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareCardActions } from "@/components/impact/ShareCardActions";
import { getImpactStatsForUser } from "@/lib/impact-stats.functions";

export function UserJourneyDialog({
  userId,
  nome,
  open,
  onOpenChange,
}: {
  userId: string | null;
  nome: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchFn = useServerFn(getImpactStatsForUser);
  const q = useQuery({
    queryKey: ["impact-stats-user", userId],
    queryFn: () => fetchFn({ data: { userId: userId as string } }),
    enabled: open && !!userId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Jornada de {nome}</DialogTitle>
          <DialogDescription>
            Mesma imagem que a pessoa vê em "Meu impacto". Baixe ou compartilhe para enviar a ela.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando os números…
          </p>
        )}

        {q.isError && (
          <p className="text-sm text-rose-600">
            Não foi possível carregar a jornada desta pessoa.
          </p>
        )}

        {q.data && (
          <ShareCardActions
            stats={q.data}
            variant="total"
            shareLabel="Compartilhar imagem"
            filename={`jornada-${userId}.png`}
            shareText={`${q.data.displayName || nome} já se conectou com ${q.data.connections.total} pessoas na campanha do Povo que Batalha! 💪`}
            preview
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
