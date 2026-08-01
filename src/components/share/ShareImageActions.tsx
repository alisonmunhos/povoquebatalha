// Ações genéricas de compartilhar/baixar QUALQUER cartão 1080x1350.
// O cartão real é renderizado fora da tela e virado em PNG.
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { elementToPngBlob, downloadBlob, sharePng } from "@/lib/share-image";

export function ShareImageActions({
  card,
  shareText,
  filename,
  backgroundColor,
  shareLabel = "Compartilhar imagem",
  preview = false,
}: {
  /** Recebe o ref que deve ser colocado no elemento raiz do cartão. */
  card: (ref: React.Ref<HTMLDivElement>) => ReactNode;
  shareText: string;
  filename: string;
  backgroundColor?: string;
  shareLabel?: string;
  preview?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);

  async function run(kind: "share" | "download") {
    if (!cardRef.current) return;
    setBusy(kind);
    try {
      const blob = await elementToPngBlob(cardRef.current, backgroundColor);
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
        <div className="overflow-hidden rounded-xl border-2">
          <div style={{ width: 324, height: 405 }} className="mx-auto">
            <div style={{ transform: "scale(0.3)", transformOrigin: "top left" }}>
              {card(null)}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" disabled={busy !== null} onClick={() => void run("share")}>
          {busy === "share" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="mr-2 h-4 w-4" />
          )}
          {shareLabel}
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => void run("download")}>
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
        {card(cardRef)}
      </div>
    </div>
  );
}
