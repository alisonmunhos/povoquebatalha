// Botões de compartilhar/baixar o cartão de impacto — reaproveitados pela
// tela do próprio agitador e pelo modal do admin ("Ver jornada").
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImpactShareCard, type ShareVariant } from "@/components/ImpactShareCard";
import type { WeekStatShape } from "@/lib/impact-week";
import type { ImpactStats } from "@/lib/impact-stats-types";
import { elementToPngBlob, downloadBlob, sharePng } from "@/lib/share-image";

export function ShareCardActions({
  stats,
  variant = "total",
  week,
  shareText,
  filename = "meu-impacto-povo-que-batalha.png",
  shareLabel = "Compartilhar",
  preview = false,
}: {
  stats: ImpactStats;
  variant?: ShareVariant;
  week?: WeekStatShape;
  shareText: string;
  filename?: string;
  shareLabel?: string;
  /** Mostra o cartão reduzido na tela (usado no modal do admin). */
  preview?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);

  async function withBlob(kind: "share" | "download") {
    if (!cardRef.current) return;
    setBusy(kind);
    try {
      const blob = await elementToPngBlob(cardRef.current);
      if (kind === "download") {
        downloadBlob(blob, filename);
        toast.success("Imagem salva no seu aparelho.");
        return;
      }
      const r = await sharePng({ blob, filename, text: shareText });
      if (r === "downloaded") {
        toast.info("Imagem baixada. Anexe no WhatsApp que já abrimos pra você.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {preview && (
        <div className="overflow-hidden rounded-xl border">
          <div style={{ width: 324, height: 405 }} className="mx-auto">
            <div style={{ transform: "scale(0.3)", transformOrigin: "top left" }}>
              <ImpactShareCard stats={stats} variant={variant} week={week} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" disabled={busy !== null} onClick={() => void withBlob("share")}>
          {busy === "share" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="mr-2 h-4 w-4" />
          )}
          {shareLabel}
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => void withBlob("download")}>
          {busy === "download" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Baixar imagem
        </Button>
      </div>

      {/* Cartão em tamanho real, fora da tela — é ele que gera o PNG. */}
      <div aria-hidden className="pointer-events-none fixed left-[-4000px] top-0 opacity-0">
        <ImpactShareCard stats={stats} innerRef={cardRef} variant={variant} week={week} />
      </div>
    </div>
  );
}
