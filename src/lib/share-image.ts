/**
 * Gera e compartilha uma imagem a partir de um bloco da tela.
 * html-to-image é carregado dinamicamente para não rodar no servidor (SSR).
 */

export async function elementToPngBlob(el: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(el, {
    cacheBust: true,
    pixelRatio: 1,
    backgroundColor: "#16130F",
    width: el.offsetWidth,
    height: el.offsetHeight,
  });
  if (!blob) throw new Error("Não foi possível gerar a imagem.");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type ShareResult = "shared" | "downloaded";

/**
 * Tenta o menu nativo de compartilhamento (vai direto pro WhatsApp no celular).
 * Sem suporte: baixa a imagem e abre o WhatsApp com o texto pronto.
 */
export async function sharePng(opts: {
  blob: Blob;
  filename: string;
  text: string;
}): Promise<ShareResult> {
  const file = new File([opts.blob], opts.filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text: opts.text });
    return "shared";
  }
  downloadBlob(opts.blob, opts.filename);
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(opts.text)}`, "_blank");
  return "downloaded";
}
