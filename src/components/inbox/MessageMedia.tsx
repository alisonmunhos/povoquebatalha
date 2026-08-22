import { useEffect, useState } from "react";
import { FileText, Download, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtBytes } from "@/lib/inbox-timeline";

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

  if (m.startsWith("audio/") || t === "audio" || t === "ptt") {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-full bg-black/5 px-2 py-1.5">
        <Play className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        <audio controls src={url} preload="metadata" className="h-8 max-w-[15rem]" />
      </div>
    );
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

/** Anexo enviado pela equipe: fica no bucket privado, precisa de URL assinada. */
export function OutboundMedia({
  path,
  mime,
  filename,
  size,
}: {
  path: string;
  mime: string;
  filename: string;
  size?: number | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.storage.from("campaign-media").createSignedUrl(path, 60 * 60).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.signedUrl) setErr(true);
      else setUrl(data.signedUrl);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (err) return <div className="mb-1 text-xs opacity-70">[anexo indisponível]</div>;
  if (!url) return <div className="mb-1 h-20 w-40 animate-pulse rounded-md bg-black/10" />;
  return <MediaView url={url} mime={mime} filename={filename} size={size} />;
}
