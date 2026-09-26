import { execFile } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import sharp from "sharp";

const SOURCE_WIDTH = 892;
const SLICE_HEIGHT = 1500;
const WEBP_QUALITY = 80;

const input = process.argv[2];
const outputDirectory = path.resolve(process.argv[3] ?? "public/feed");
const renderedPagePath = path.resolve("/tmp/campaign-feed-page.jpg");
const run = promisify(execFile);

if (!input) {
  console.error("Uso: node scripts/pdf-to-feed.mjs <arquivo.pdf> [pasta-de-saida]");
  process.exit(1);
}

await mkdir(outputDirectory, { recursive: true });
const existingFiles = await readdir(outputDirectory);
await Promise.all(
  existingFiles
    .filter((file) => /^fatia-\d+\.webp$/.test(file))
    .map((file) => rm(path.join(outputDirectory, file))),
);

// A página tem 428,136 × 14.400 pt. Em 150 dpi ela volta aos 892 × 30.000 px originais.
const renderedPrefix = renderedPagePath.replace(/\.jpg$/i, "");
await run("pdftoppm", [
  "-f", "1", "-l", "1", "-r", "150", "-jpeg",
  "-jpegopt", "quality=95,progressive=y,optimize=y", "-singlefile",
  path.resolve(input), renderedPrefix,
]);

const image = sharp(renderedPagePath, { limitInputPixels: false });
const metadata = await image.metadata();
if (metadata.width !== SOURCE_WIDTH || metadata.height !== 30000) {
  throw new Error(`Dimensões inesperadas: ${metadata.width}x${metadata.height}. Esperado: 892x30000.`);
}

const sliceCount = Math.ceil(metadata.height / SLICE_HEIGHT);
for (let index = 0; index < sliceCount; index += 1) {
  const top = index * SLICE_HEIGHT;
  const sliceHeight = Math.min(SLICE_HEIGHT, metadata.height - top);
  const filename = `fatia-${String(index + 1).padStart(2, "0")}.webp`;
  await sharp(renderedPagePath, { limitInputPixels: false })
    .extract({ left: 0, top, width: SOURCE_WIDTH, height: sliceHeight })
    .webp({ quality: WEBP_QUALITY, smartSubsample: true })
    .toFile(path.join(outputDirectory, filename));
  console.log(`${filename}: ${SOURCE_WIDTH}x${sliceHeight}`);
}

await sharp(renderedPagePath, { limitInputPixels: false })
  .extract({ left: 0, top: 0, width: SOURCE_WIDTH, height: 468 })
  .resize(1200, 630)
  .jpeg({ quality: 85, progressive: true })
  .toFile(path.join(outputDirectory, "preview.jpg"));

console.log(`Concluído: ${sliceCount} fatias em ${outputDirectory}`);