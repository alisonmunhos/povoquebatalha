export async function generateQrDataUrl(url: string) {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(url, { width: 320, margin: 1 });
}