import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_CANVAS_PIXEL_HEIGHT = 4000;

type PdfDocumentViewerProps = {
  url: string;
  title: string;
};

export function PdfDocumentViewer({ url, title }: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastRenderedWidth = 0;
    let renderGeneration = 0;

    const renderDocument = async () => {
      const generation = ++renderGeneration;
      setStatus("loading");
      container.replaceChildren();

      try {
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        loadingTask = pdfjs.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled || generation !== renderGeneration) return;

        const cssWidth = container.clientWidth;
        if (cssWidth <= 0) throw new Error("O visualizador não possui largura disponível.");
        lastRenderedWidth = cssWidth;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled || generation !== renderGeneration) return;

          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const cssScale = cssWidth / baseViewport.width;
          const cssViewport = page.getViewport({ scale: cssScale });
          const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
          const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

          const pageGroup = document.createElement("div");
          pageGroup.className = "overflow-hidden bg-card shadow-sm";
          pageGroup.setAttribute("role", "img");
          pageGroup.setAttribute("aria-label", `Página ${pageNumber} de ${pdf.numPages} — ${title}`);

          const slicePixelHeight = Math.min(MAX_CANVAS_PIXEL_HEIGHT, renderViewport.height);
          const sliceCount = Math.ceil(renderViewport.height / slicePixelHeight);

          for (let sliceIndex = 0; sliceIndex < sliceCount; sliceIndex += 1) {
            if (cancelled || generation !== renderGeneration) return;
            const pixelTop = sliceIndex * slicePixelHeight;
            const currentPixelHeight = Math.min(
              slicePixelHeight,
              renderViewport.height - pixelTop,
            );

            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(renderViewport.width);
            canvas.height = Math.ceil(currentPixelHeight);
            canvas.style.display = "block";
            canvas.style.width = "100%";
            canvas.style.height = `${currentPixelHeight / pixelRatio}px`;

            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("Não foi possível exibir uma parte do PDF.");
            await page.render({
              canvas,
              canvasContext: context,
              viewport: renderViewport,
              transform: [1, 0, 0, 1, 0, -pixelTop],
            }).promise;
            pageGroup.append(canvas);
          }

          container.append(pageGroup);
          page.cleanup();
        }

        if (!cancelled && generation === renderGeneration) setStatus("ready");
      } catch (error) {
        if (!cancelled && generation === renderGeneration) {
          console.error("Falha ao renderizar PDF", error);
          container.replaceChildren();
          setStatus("error");
        }
      }
    };

    void renderDocument();

    const observer = new ResizeObserver(() => {
      if (Math.abs(container.clientWidth - lastRenderedWidth) < 1) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void renderDocument(), 180);
    });
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      void loadingTask?.destroy();
      container.replaceChildren();
    };
  }, [url, title]);

  return (
    <div className="relative min-h-32" aria-busy={status === "loading"}>
      {status === "loading" ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando documento…
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-4 border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível exibir este documento aqui.</p>
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Abrir PDF
            </a>
          </Button>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={status === "error" ? "hidden" : "flex w-full flex-col gap-3 md:gap-5"}
      />
    </div>
  );
}