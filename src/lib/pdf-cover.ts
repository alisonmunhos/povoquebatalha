// Gera no navegador uma capa JPEG 1200x630 a partir do topo da 1ª página do PDF.
// Usada como imagem de prévia quando o link é enviado pelo WhatsApp.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const W = 1200;
const H = 630;

export async function renderPdfCoverBase64(url: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ url });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = W / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas indisponível");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    // Páginas mais baixas que 630px são centralizadas; as altas mostram o topo.
    const offsetY = viewport.height < H ? (H - viewport.height) / 2 : 0;
    await page.render({ canvasContext: ctx, viewport, transform: [1, 0, 0, 1, 0, offsetY] }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return dataUrl.split(",")[1] ?? "";
  } finally {
    void task.destroy();
  }
}
