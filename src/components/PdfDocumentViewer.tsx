import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";

// Fatias menores = primeira imagem aparece mais rápido e menos memória no celular.
const SLICE_CSS_HEIGHT = 1200;
const MAX_CANVAS_PIXEL_HEIGHT = 4000;

type PdfDocumentViewerProps = {
  url: string;
  title: string;
};

type Slice = {
  canvas: HTMLCanvasElement;
  page: PDFPageProxy;
  scale: number;
  pixelTop: number;
  rendered: boolean;
};

export function PdfDocumentViewer({ url, title }: PdfDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let observer: IntersectionObserver | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastWidth = 0;
    let generation = 0;
    let pdfPromise: Promise<import("pdfjs-dist").PDFDocumentProxy> | undefined;

    const loadPdf = () => {
      if (!pdfPromise) {
        pdfPromise = import("pdfjs-dist").then((pdfjs) => {
          pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
          // Carrega por partes (range requests) e começa a mostrar antes do download terminar.
          loadingTask = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 262144 });
          return loadingTask.promise;
        });
      }
      return pdfPromise;
    };

    // Fila: renderiza uma fatia por vez, na ordem em que entram na tela.
    const queue: Slice[] = [];
    let working = false;
    const pump = async (gen: number) => {
      if (working) return;
      working = true;
      while (queue.length && !cancelled && gen === generation) {
        const slice = queue.shift()!;
        if (slice.rendered) continue;
        slice.rendered = true;
        const ctx = slice.canvas.getContext("2d", { alpha: false });
        if (!ctx) continue;
        try {
          await slice.page.render({
            canvasContext: ctx,
            viewport: slice.page.getViewport({ scale: slice.scale }),
            transform: [1, 0, 0, 1, 0, -slice.pixelTop],
          }).promise;
        } catch (error) {
          console.error("Falha ao renderizar trecho do PDF", error);
        }
      }
      working = false;
    };

    const layout = async () => {
      const gen = ++generation;
      observer?.disconnect();
      queue.length = 0;
      const cssWidth = container.clientWidth;
      if (cssWidth <= 0) return;
      lastWidth = cssWidth;

      try {
        const pdf = await loadPdf();
        if (cancelled || gen !== generation) return;
        container.replaceChildren();
        const slices = new Map<Element, Slice>();

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const slice = slices.get(entry.target);
              if (slice && !slice.rendered) queue.push(slice);
              observer?.unobserve(entry.target);
            }
            queue.sort((a, b) => a.canvas.offsetTop - b.canvas.offsetTop);
            void pump(gen);
          },
          { rootMargin: "1500px 0px" },
        );

        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          if (cancelled || gen !== generation) return;
          const base = page.getViewport({ scale: 1 });
          const cssScale = cssWidth / base.width;
          const cssHeight = base.height * cssScale;
          // Documentos muito longos: nitidez limitada para poupar memória do celular.
          const dprCap = cssHeight > cssWidth * 3 ? 1.5 : 2;
          const ratio = Math.min(dprCap, Math.max(1, window.devicePixelRatio || 1));
          const scale = cssScale * ratio;
          const pixelHeight = base.height * scale;
          const pixelWidth = Math.ceil(base.width * scale);
          const slicePixel = Math.min(MAX_CANVAS_PIXEL_HEIGHT, SLICE_CSS_HEIGHT * ratio);

          const group = document.createElement("div");
          group.className = "overflow-hidden bg-card shadow-sm";
          group.setAttribute("role", "img");
          group.setAttribute("aria-label", `Página ${n} de ${pdf.numPages} — ${title}`);
          container.append(group);

          for (let top = 0; top < pixelHeight; top += slicePixel) {
            const h = Math.min(slicePixel, pixelHeight - top);
            const canvas = document.createElement("canvas");
            canvas.width = pixelWidth;
            canvas.height = Math.ceil(h);
            canvas.style.display = "block";
            canvas.style.width = "100%";
            canvas.style.height = `${h / ratio}px`;
            canvas.style.background = "white";
            group.append(canvas);
            slices.set(canvas, { canvas, page, scale, pixelTop: top, rendered: false });
            observer.observe(canvas);
          }
          if (n === 1) setStatus("ready");
        }
        setStatus("ready");
      } catch (error) {
        if (!cancelled && gen === generation) {
          console.error("Falha ao carregar PDF", error);
          container.replaceChildren();
          setStatus("error");
        }
      }
    };

    setStatus("loading");
    void layout();

    const resizeObserver = new ResizeObserver(() => {
      if (Math.abs(container.clientWidth - lastWidth) < 8) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => void layout(), 250);
    });
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      observer?.disconnect();
      resizeObserver.disconnect();
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
