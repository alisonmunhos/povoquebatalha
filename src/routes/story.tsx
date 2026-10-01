import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, CheckCircle2, ImagePlus, Loader2, Minus, Plus, RefreshCw, Share2 } from "lucide-react";
import frameUrl from "@/assets/moldura-story-eu-voto-karen.png";
import { Button } from "@/components/ui/button";
import { canonical, shareMeta, SITE_URL } from "@/lib/site-meta";

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const NUDGE_DISTANCE = 40;
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
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.zoom));
  const renderedWidth = photo.width * coverScale * zoom;
  const renderedHeight = photo.height * coverScale * zoom;
  const maxX = Math.max(0, (renderedWidth + STORY_WIDTH) / 2 - NUDGE_DISTANCE);
  const maxY = Math.max(0, (renderedHeight + STORY_HEIGHT) / 2 - NUDGE_DISTANCE);
  return {
    zoom,
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
  const touchesRef = useRef(new Map<number, { x: number; y: number }>());
  const touchGestureRef = useRef<Gesture | null>(null);
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
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * Math.exp(-normalizedDelta * 0.0015)));
      const ratio = nextZoom / current.zoom;
      setTransform({
        zoom: nextZoom,
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio,
      });
    };
    const touchPosition = (touch: Touch) => {
      const rect = editor.getBoundingClientRect();
      const factor = STORY_WIDTH / rect.width;
      return {
        x: (touch.clientX - rect.left - rect.width / 2) * factor,
        y: (touch.clientY - rect.top - rect.height / 2) * factor,
      };
    };
    const updateTouches = (event: TouchEvent) => {
      touchesRef.current.clear();
      for (const touch of Array.from(event.touches)) {
        touchesRef.current.set(touch.identifier, touchPosition(touch));
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      if (!photoRef.current) return;
      event.preventDefault();
      updateTouches(event);
      touchGestureRef.current = getGesture(touchesRef.current);
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!photoRef.current) return;
      event.preventDefault();
      const previous = touchGestureRef.current;
      updateTouches(event);
      const next = getGesture(touchesRef.current);
      if (!previous || !next) return;
      const current = transformRef.current;
      const ratio = previous.count === 2 && next.count === 2 && previous.distance > 0
        ? Math.min(MAX_ZOOM / current.zoom, Math.max(MIN_ZOOM / current.zoom, next.distance / previous.distance))
        : 1;
      setTransform({
        zoom: current.zoom * ratio,
        x: next.centerX - (previous.centerX - current.x) * ratio,
        y: next.centerY - (previous.centerY - current.y) * ratio,
      });
      touchGestureRef.current = next;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!photoRef.current) return;
      event.preventDefault();
      updateTouches(event);
      touchGestureRef.current = getGesture(touchesRef.current);
    };
    editor.addEventListener("wheel", onWheel, { passive: false });
    editor.addEventListener("touchstart", onTouchStart, { passive: false });
    editor.addEventListener("touchmove", onTouchMove, { passive: false });
    editor.addEventListener("touchend", onTouchEnd, { passive: false });
    editor.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      editor.removeEventListener("wheel", onWheel);
      editor.removeEventListener("touchstart", onTouchStart);
      editor.removeEventListener("touchmove", onTouchMove);
      editor.removeEventListener("touchend", onTouchEnd);
      editor.removeEventListener("touchcancel", onTouchEnd);
    };
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
    if (event.pointerType === "touch") return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Alguns navegadores Android recusam captura durante a transição do toque.
    }
    pointersRef.current.set(event.pointerId, pointerPosition(event));
    gestureRef.current = getGesture(pointersRef.current);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    if (!pointersRef.current.has(event.pointerId) || !photoRef.current) return;
    pointersRef.current.set(event.pointerId, pointerPosition(event));
    const previous = gestureRef.current;
    const next = getGesture(pointersRef.current);
    if (!previous || !next) return;
    const current = transformRef.current;
    const ratio = previous.count === 2 && next.count === 2 && previous.distance > 0
      ? Math.min(MAX_ZOOM / current.zoom, Math.max(MIN_ZOOM / current.zoom, next.distance / previous.distance))
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
    if (event.pointerType === "touch") return;
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
      const editor = editorRef.current;
      context.fillStyle = editor ? getComputedStyle(editor).backgroundColor : "#f0aa04";
      context.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
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

  function changeZoom(nextZoom: number) {
    const current = transformRef.current;
    setTransform({ ...current, zoom: nextZoom });
  }

  function nudge(x: number, y: number) {
    const current = transformRef.current;
    setTransform({ ...current, x: current.x + x, y: current.y + y });
  }

  return (
    <main className="min-h-screen bg-secondary px-3 py-3 text-secondary-foreground sm:px-6 sm:py-10" translate="no">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-2 text-center sm:mb-5">
          <p className="font-display text-xs text-primary sm:text-sm">Povo que Batalha</p>
          <h1 className="font-display text-2xl sm:mt-1 sm:text-4xl">Monte seu Story</h1>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={choosePhoto} />

        <div
          ref={editorRef}
          className="relative mx-auto aspect-[9/16] w-[min(100%,calc(62dvh*9/16))] touch-none select-none overflow-hidden bg-primary shadow-punch ring-2 ring-primary sm:w-full"
          style={{ touchAction: "none" }}
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

        {photo ? (
          <div className="mx-auto mt-2 flex w-full items-center justify-center gap-1" aria-label="Controles de enquadramento">
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Diminuir zoom" title="Diminuir zoom" onClick={() => changeZoom(transform.zoom - 0.1)}>
              <Minus className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={transform.zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
              className="h-8 min-w-0 flex-1 accent-primary"
              aria-label={`Zoom ${transform.zoom.toFixed(1)} vezes`}
            />
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Aumentar zoom" title="Aumentar zoom" onClick={() => changeZoom(transform.zoom + 0.1)}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Mover para cima" title="Mover para cima" onClick={() => nudge(0, -NUDGE_DISTANCE)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Mover para baixo" title="Mover para baixo" onClick={() => nudge(0, NUDGE_DISTANCE)}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Mover para esquerda" title="Mover para esquerda" onClick={() => nudge(-NUDGE_DISTANCE, 0)}><ArrowLeft className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Mover para direita" title="Mover para direita" onClick={() => nudge(NUDGE_DISTANCE, 0)}><ArrowRight className="h-4 w-4" /></Button>
          </div>
        ) : null}

        <div className="mt-2 space-y-2 sm:mt-5 sm:space-y-3">
          {!photo ? (
            <Button size="lg" className="h-14 w-full text-base" disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
              {busy === "photo" ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              Escolher foto
            </Button>
          ) : (
            <>
              <Button size="lg" className="h-11 w-full text-base sm:h-14" disabled={busy !== null} onClick={() => void generateStory()}>
                {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />}
                Compartilhar
              </Button>
              <Button size="lg" variant="outline" className="h-10 w-full border-primary bg-transparent text-secondary-foreground hover:bg-primary hover:text-primary-foreground sm:h-12" disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
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

        <p className="mt-3 text-center text-xs leading-relaxed text-secondary-foreground/80 sm:mt-5 sm:text-sm">
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