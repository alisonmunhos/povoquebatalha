import { useEffect, useState } from "react";
import { FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtBytes } from "@/lib/inbox-timeline";
import { AudioPlayer } from "@/components/inbox/AudioPlayer";


type Props = {
  url: string;
  mime: string;
  filename: string;
  size?: number | null;
  tipo?: string | null;
};

/** Player/preview de mídia — usado tanto para recebidas quanto enviadas. */
export function MediaView({ url, mime, filename, size, tipo }: Props) {
  const m = (mime ?? "").toLowerCase();
  const t = (tipo ?? "").toLowerCase();

  if (t === "sticker") {
    return <img src={url} alt="figurinha" loading="lazy" className="h-32 w-32 object-contain" />;
  }

  if (m.startsWith("image/") || t === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-1">
        <img
          src={url}
          alt={filename}
          loading="lazy"
          className="max-h-72 w-auto max-w-full rounded-md bg-black/5"
        />
      </a>
    );
  }

  if (m.startsWith("video/") || t === "video") {
    return (
      <div className="mb-1">
        <video
          src={url}
          controls
          preload="metadata"
          className="max-h-72 w-full max-w-[20rem] rounded-md bg-black"
        />
      </div>
    );
  }

  if (m.startsWith("audio/") || t === "audio" || t === "ptt" || t === "voice") {
    return <AudioPlayer src={url} isVoice={t === "ptt" || t === "voice"} />;
  }


  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded-md border border-current/10 bg-black/5 px-2 py-2 text-xs no-underline"
    >
      <FileText className="h-6 w-6 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{filename}</span>
        <span className="block opacity-70">
          {[fmtBytes(size), (mime || "arquivo").split("/").pop()?.toUpperCase()].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" />
    </a>
  );
}

// Cache de URLs assinadas por bucket+caminho. Assinar uma vez e reaproveitar
// mantém a src do <audio>/<video> estável entre os refetches do Inbox (a cada
// 15s), que é o que fazia o áudio reiniciar do zero.
const SIGN_TTL_SEC = 60 * 60;
const RESIGN_MARGIN_MS = 5 * 60 * 1000;
const signedCache = new Map<string, { url: string; expiresAt: number }>();
const signedInflight = new Map<string, Promise<string | null>>();

async function getSignedUrl(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}|${path}`;
  const hit = signedCache.get(key);
  if (hit && hit.expiresAt - Date.now() > RESIGN_MARGIN_MS) return hit.url;
  const inflight = signedInflight.get(key);
  if (inflight) return inflight;
  const p = supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGN_TTL_SEC)
    .then(({ data, error }) => {
      signedInflight.delete(key);
      if (error || !data?.signedUrl) return null;
      signedCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + SIGN_TTL_SEC * 1000 });
      return data.signedUrl;
    });
  signedInflight.set(key, p);
  return p;
}

/** Mídia em bucket privado: assina a URL uma vez e cacheia (não a cada poll). */
export function SignedMedia({
  bucket,
  path,
  mime,
  filename,
  size,
  tipo,
}: {
  bucket: string;
  path: string;
  mime: string;
  filename: string;
  size?: number | null;
  tipo?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(() => signedCache.get(`${bucket}|${path}`)?.url ?? null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    getSignedUrl(bucket, path).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setErr(true);
    });
    return () => {
      alive = false;
    };
  }, [bucket, path]);

  if (err) return <div className="mb-1 text-xs opacity-70">[anexo indisponível]</div>;
  if (!url) return <div className="mb-1 h-20 w-40 animate-pulse rounded-md bg-black/10" />;
  return <MediaView url={url} mime={mime} filename={filename} size={size} tipo={tipo} />;
}

/** Anexo enviado pela equipe: fica no bucket privado, precisa de URL assinada. */
export function OutboundMedia(props: {
  path: string;
  mime: string;
  filename: string;
  size?: number | null;
}) {
  return <SignedMedia bucket="campaign-media" {...props} />;
}

