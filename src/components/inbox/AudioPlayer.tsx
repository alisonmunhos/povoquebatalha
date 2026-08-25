// Player de áudio no estilo WhatsApp: alvo de toque grande, barra de arraste
// generosa, tempo MM:SS, velocidade e "só um áudio por vez".
// Importante: o <audio> nunca recebe uma src nova por re-render — a src só muda
// quando a prop `src` muda de verdade (URL assinada é cacheada por path).
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Mic } from "lucide-react";

const SPEEDS = [1, 1.5, 2] as const;

/** Registro global do áudio tocando: dar play em um pausa o outro. */
let currentAudio: HTMLAudioElement | null = null;

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function AudioPlayer({ src, isVoice }: { src: string; isVoice?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [seeking, setSeeking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => {
      if (!seeking) setCurrent(el.currentTime);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
    };
    const onPlay = () => {
      if (currentAudio && currentAudio !== el) currentAudio.pause();
      currentAudio = el;
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      el.currentTime = 0;
    };
    const onError = () => setFailed(true);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      if (currentAudio === el) currentAudio = null;
    };
  }, [seeking]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.playbackRate = speed;
      void el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }, [speed]);

  const cycleSpeed = useCallback(() => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as 1) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="mb-1 w-full max-w-[17rem]" data-no-swipe>
      {/* Elemento nativo escondido: fonte estável, controles são os nossos. */}
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <div className="flex items-center gap-2 rounded-full bg-black/5 px-2 py-1.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausar áudio" : "Tocar áudio"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
        </button>

        <div className="min-w-0 flex-1">
          {/* Área de toque de 28px com barra visual fina no meio. */}
          <div className="relative flex h-7 items-center">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-current/20">
              <div className="h-full rounded-full bg-current/70" style={{ width: `${pct}%` }} />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-current shadow"
              style={{ left: `calc(${pct}% - 6px)` }}
            />
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 0}
              step={0.05}
              value={current}
              aria-label="Posição do áudio"
              onPointerDown={() => setSeeking(true)}
              onChange={(e) => setCurrent(Number(e.target.value))}
              onPointerUp={() => {
                if (audioRef.current) audioRef.current.currentTime = current;
                setSeeking(false);
              }}
              onKeyUp={() => {
                if (audioRef.current) audioRef.current.currentTime = current;
              }}
              className="relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-transparent"
            />
          </div>

          <div className="flex items-center justify-between text-[10px] tabular-nums opacity-70">
            <span className="flex items-center gap-1">
              {isVoice && <Mic className="h-3 w-3" aria-hidden />}
              {fmtTime(current)} / {duration > 0 ? fmtTime(duration) : "--:--"}
            </span>
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label="Velocidade de reprodução"
              className="rounded-full bg-current/10 px-1.5 py-0.5 font-semibold"
            >
              {speed}x
            </button>
          </div>
        </div>
      </div>

      {failed && (
        <div className="mt-1 text-[11px] opacity-70">
          Não foi possível tocar este áudio neste navegador.{" "}
          <a href={src} target="_blank" rel="noreferrer" className="underline">
            Baixar
          </a>
        </div>
      )}
    </div>
  );
}
