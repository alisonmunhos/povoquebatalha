import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, RefreshCw, Share2 } from "lucide-react";
import frameUrl from "@/assets/moldura-story-eu-voto-karen.png";
import { Button } from "@/components/ui/button";
import { canonical, shareMeta, SITE_URL } from "@/lib/site-meta";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const MAX_ZOOM = 4;
const PATH = "/story";

type PhotoState = {
  url: string;
  width: number;
  height: number;
};

type Transform = {
  zoom: number;
  x: number;
  y: number;
};

type Gesture = {
  centerX: number;
  centerY: number;
  distance: number;
  count: number;
};

export const Route = createFileRoute("/story")({
  head: () => ({
    meta: shareMeta({
      title: "Eu voto Karen 50555",
      description: "Monte seu story com a moldura da campanha",
      path: PATH,
      image: `${SITE_URL}${frameUrl}`,
    }),
    links: canonical(PATH),
  }),
  component: StoryMakerPage,
});

function clampTransform(transform: Transform, photo: PhotoState): Transform {
  const coverScale = Math.max(STORY_WIDTH / photo.width, STORY_HEIGHT / photo.height);
  const renderedWidth = photo.width * coverScale * transform.zoom;
  const renderedHeight = photo.height * coverScale * transform.zoom;
  const maxX = Math.max(0, (renderedWidth - STORY_WIDTH) / 2);
  const maxY = Math.max(0, (renderedHeight - STORY_HEIGHT) / 2);
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(1, transform.zoom)),
    x: Math.min(maxX, Math.max(-maxX, transform.x)),
    y: Math.min(maxY, Math.max(-maxY, transform.y)),
  };
}

function getGesture(points: Map<number, { x: number; y: number }>): Gesture | null {
  const values = Array.from(points.values());
  if (values.length === 0) return null;
  if (values.length === 1) {
    return { centerX: values[0].x, centerY: values[0].y, distance: 0, count: 1 };
  }
  const first = values[0];
  const second = values[1];
  return {
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    count: 2,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível preparar a foto."))), type, quality);
  });
}

function loadHtmlImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível abrir esta imagem."));
    image.src = src;
  });
}

async function normalizePhoto(file: File): Promise<{ photo: PhotoState; image: HTMLImageElement }> {
  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let bitmap: ImageBitmap | undefined;
  let fallbackUrl: string | undefined;

  try {
    if ("createImageBitmap" in window) {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      source = bitmap;
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
    } else {
      fallbackUrl = URL.createObjectURL(file);
      const fallback = await loadHtmlImage(fallbackUrl);
      source = fallback;
      sourceWidth = fallback.naturalWidth;
      sourceHeight = fallback.naturalHeight;
    }

    const sizeLimit = 4096;
    const reduction = Math.min(1, sizeLimit / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * reduction));
    const height = Math.max(1, Math.round(sourceHeight * reduction));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.drawImage(source, 0, 0, width, height);
    const normalized = await canvasToBlob(canvas, "image/jpeg", 0.94);
    const url = URL.createObjectURL(normalized);
    const image = await loadHtmlImage(url);
    return { photo: { url, width, height }, image };
  } finally {
    bitmap?.close();
    if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
  }
}

function StoryMakerPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const photoRef = useRef<PhotoState | null>(null);
  const transformRef = useRef<Transform>({ zoom: 1, x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<Gesture | null>(null);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [transform, setTransformState] = useState<Transform>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState<"photo" | "share" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setTransform = useCallback((next: Transform) => {
    const currentPhoto = photoRef.current;
    if (!currentPhoto) return;
    const clamped = clampTransform(next, currentPhoto);
    transformRef.current = clamped;
    setTransformState(clamped);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const onWheel = (event: WheelEvent) => {
      const currentPhoto = photoRef.current;
      if (!currentPhoto) return;
      event.preventDefault();
      const rect = editor.getBoundingClientRect();
      const factor = STORY_WIDTH / rect.width;
      const pointX = (event.clientX - rect.left - rect.width / 2) * factor;
      const pointY = (event.clientY - rect.top - rect.height / 2) * factor;
      const normalizedDelta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const current = transformRef.current;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(1, current.zoom * Math.exp(-normalizedDelta * 0.0015)));
      const ratio = nextZoom / current.zoom;
      setTransform({
        zoom: nextZoom,
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio,
      });
    };
    editor.addEventListener("wheel", onWheel, { passive: false });
    return () => editor.removeEventListener("wheel", onWheel);
  }, [setTransform]);

  useEffect(() => () => {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
  }, []);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Escolha um arquivo de imagem.");
      return;
    }
    setBusy("photo");
    setNotice(null);
    try {
      const normalized = await normalizePhoto(file);
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.url);
      photoRef.current = normalized.photo;
      imageRef.current = normalized.image;
      setPhoto(normalized.photo);
      setTransform({ zoom: 1, x: 0, y: 0 });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível abrir esta imagem.");
    } finally {
      setBusy(null);
    }
  }

  function pointerPosition(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const factor = STORY_WIDTH / rect.width;
    return {
      x: (event.clientX - rect.left - rect.width / 2) * factor,
      y: (event.clientY - rect.top - rect.height / 2) * factor,
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!photoRef.current) {
      fileInputRef.current?.click();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, pointerPosition(event));
    gestureRef.current = getGesture(pointersRef.current);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId) || !photoRef.current) return;
    pointersRef.current.set(event.pointerId, pointerPosition(event));
    const previous = gestureRef.current;
    const next = getGesture(pointersRef.current);
    if (!previous || !next) return;
    const current = transformRef.current;
    const ratio = previous.count === 2 && next.count === 2 && previous.distance > 0
      ? Math.min(MAX_ZOOM / current.zoom, Math.max(1 / current.zoom, next.distance / previous.distance))
      : 1;
    const nextZoom = current.zoom * ratio;
    setTransform({
      zoom: nextZoom,
      x: next.centerX - (previous.centerX - current.x) * ratio,
      y: next.centerY - (previous.centerY - current.y) * ratio,
    });
    gestureRef.current = next;
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    gestureRef.current = getGesture(pointersRef.current);
  }

  async function generateStory() {
    const source = imageRef.current;
    const currentPhoto = photoRef.current;
    if (!source || !currentPhoto) return;
    setBusy("share");
    setNotice(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = STORY_WIDTH;
      canvas.height = STORY_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível gerar o Story.");
      const current = transformRef.current;
      const coverScale = Math.max(STORY_WIDTH / currentPhoto.width, STORY_HEIGHT / currentPhoto.height);
      const width = currentPhoto.width * coverScale * current.zoom;
      const height = currentPhoto.height * coverScale * current.zoom;
      context.drawImage(source, STORY_WIDTH / 2 + current.x - width / 2, STORY_HEIGHT / 2 + current.y - height / 2, width, height);
      const frame = await loadHtmlImage(frameUrl);
      context.drawImage(frame, 0, 0, STORY_WIDTH, STORY_HEIGHT);
      const blob = await canvasToBlob(canvas, "image/png");
      const file = new File([blob], "eu-voto-karen.png", { type: "image/png" });
      const shareData = { files: [file], title: "Eu voto Karen 50555" };
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNotice("Imagem salva. Abra o Instagram e poste nos Stories.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(error instanceof Error ? error.message : "Não foi possível gerar o Story.");
    } finally {
      setBusy(null);
    }
  }

  const coverScale = photo ? Math.max(STORY_WIDTH / photo.width, STORY_HEIGHT / photo.height) : 1;
  const photoStyle: CSSProperties | undefined = photo
    ? {
        width: `${(photo.width * coverScale * transform.zoom * 100) / STORY_WIDTH}%`,
        height: `${(photo.height * coverScale * transform.zoom * 100) / STORY_HEIGHT}%`,
        left: `${50 + (transform.x * 100) / STORY_WIDTH}%`,
        top: `${50 + (transform.y * 100) / STORY_HEIGHT}%`,
        transform: "translate(-50%, -50%)",
      }
    : undefined;

  return (
    <main className="min-h-screen bg-secondary px-3 py-7 text-secondary-foreground sm:px-6 sm:py-10" translate="no">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-5 text-center">
          <p className="font-display text-sm text-primary">Povo que Batalha</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">Monte seu Story</h1>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={choosePhoto} />

        <div
          ref={editorRef}
          className="relative aspect-[9/16] w-full touch-none select-none overflow-hidden bg-muted shadow-punch ring-2 ring-primary"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          aria-label={photo ? "Enquadrar foto do Story" : "Escolher foto para o Story"}
        >
          {photo ? (
            <img src={photo.url} alt="Sua foto" draggable={false} className="pointer-events-none absolute max-w-none" style={photoStyle} />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-muted px-8 text-center text-muted-foreground"
            >
              {busy === "photo" ? <Loader2 className="h-10 w-10 animate-spin" /> : <Camera className="h-10 w-10" />}
              <span className="font-semibold">Toque para escolher sua foto</span>
            </button>
          )}
          <img src={frameUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
        </div>

        <div className="mt-5 space-y-3">
          {!photo ? (
            <Button size="lg" className="h-14 w-full text-base" disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
              {busy === "photo" ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              Escolher foto
            </Button>
          ) : (
            <>
              <Button size="lg" className="h-14 w-full text-base" disabled={busy !== null} onClick={() => void generateStory()}>
                {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />}
                Compartilhar
              </Button>
              <Button size="lg" variant="outline" className="h-12 w-full border-primary bg-transparent text-secondary-foreground hover:bg-primary hover:text-primary-foreground" disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
                <RefreshCw /> Trocar foto
              </Button>
            </>
          )}

          {notice ? (
            <div className="flex items-start gap-2 border border-primary/40 bg-primary/10 p-3 text-sm" role="status">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{notice}</span>
            </div>
          ) : null}
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-secondary-foreground/80">
          Toque em Compartilhar e escolha Instagram &gt; Stories. Sua foto não sai do seu celular.
        </p>
        <div className="mt-3 text-center">
          <Link
            to="/termos/$slug"
            params={{ slug: "principais-acoes-do-mandato-de-karen-santos" }}
            className="text-sm font-semibold text-primary underline underline-offset-4"
          >
            Veja como eu voto
          </Link>
        </div>
      </div>
    </main>
  );
}