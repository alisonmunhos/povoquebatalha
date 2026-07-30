import { decode, encode } from "jpeg-js";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_MARGIN = 48;
const BG_R = 22;
const BG_G = 19;
const BG_B = 15;

type DecodedImage = {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readPixel(source: DecodedImage, x: number, y: number) {
  const safeX = clamp(Math.round(x), 0, source.width - 1);
  const safeY = clamp(Math.round(y), 0, source.height - 1);
  const index = (safeY * source.width + safeX) * 4;
  return {
    r: source.data[index] ?? 0,
    g: source.data[index + 1] ?? 0,
    b: source.data[index + 2] ?? 0,
    a: source.data[index + 3] ?? 255,
  };
}

function blendPixel(
  target: Uint8Array,
  x: number,
  y: number,
  color: { r: number; g: number; b: number; a?: number },
) {
  if (x < 0 || y < 0 || x >= OG_WIDTH || y >= OG_HEIGHT) return;
  const index = (y * OG_WIDTH + x) * 4;
  const alpha = (color.a ?? 255) / 255;
  target[index] = Math.round((color.r * alpha) + ((target[index] ?? 0) * (1 - alpha)));
  target[index + 1] = Math.round((color.g * alpha) + ((target[index + 1] ?? 0) * (1 - alpha)));
  target[index + 2] = Math.round((color.b * alpha) + ((target[index + 2] ?? 0) * (1 - alpha)));
  target[index + 3] = 255;
}

function drawCoverBackground(target: Uint8Array, source: DecodedImage) {
  const scale = Math.max(OG_WIDTH / source.width, OG_HEIGHT / source.height);
  const cropWidth = OG_WIDTH / scale;
  const cropHeight = OG_HEIGHT / scale;
  const cropX = (source.width - cropWidth) / 2;
  const cropY = (source.height - cropHeight) / 2;

  for (let y = 0; y < OG_HEIGHT; y += 1) {
    for (let x = 0; x < OG_WIDTH; x += 1) {
      const pixel = readPixel(source, cropX + x / scale, cropY + y / scale);
      const index = (y * OG_WIDTH + x) * 4;
      target[index] = Math.round(pixel.r * 0.28 + BG_R * 0.72);
      target[index + 1] = Math.round(pixel.g * 0.28 + BG_G * 0.72);
      target[index + 2] = Math.round(pixel.b * 0.28 + BG_B * 0.72);
      target[index + 3] = 255;
    }
  }
}

function drawShadow(target: Uint8Array, left: number, top: number, width: number, height: number) {
  const shadowSize = 18;
  for (let y = top - shadowSize; y < top + height + shadowSize; y += 1) {
    for (let x = left - shadowSize; x < left + width + shadowSize; x += 1) {
      const dx = x < left ? left - x : x > left + width ? x - (left + width) : 0;
      const dy = y < top ? top - y : y > top + height ? y - (top + height) : 0;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > shadowSize) continue;
      const alpha = Math.round(95 * (1 - distance / shadowSize));
      blendPixel(target, x, y, { r: 0, g: 0, b: 0, a: alpha });
    }
  }
}

function drawContainedForeground(target: Uint8Array, source: DecodedImage) {
  const scale = Math.min((OG_WIDTH - OG_MARGIN * 2) / source.width, OG_HEIGHT / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  const left = Math.round((OG_WIDTH - drawWidth) / 2);
  const top = Math.round((OG_HEIGHT - drawHeight) / 2);

  drawShadow(target, left, top, drawWidth, drawHeight);

  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const pixel = readPixel(source, x / scale, y / scale);
      blendPixel(target, left + x, top + y, pixel);
    }
  }
}

function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

export async function createOpenGraphJpeg(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) return null;

  let source: DecodedImage;
  try {
    source = decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: true,
      maxMemoryUsageInMB: 256,
    });
  } catch {
    return null;
  }

  if (!source.width || !source.height) return null;

  const target = new Uint8Array(OG_WIDTH * OG_HEIGHT * 4);
  drawCoverBackground(target, source);
  drawContainedForeground(target, source);

  const encoded = encode({ width: OG_WIDTH, height: OG_HEIGHT, data: target }, 88);
  return new Uint8Array(encoded.data);
}
