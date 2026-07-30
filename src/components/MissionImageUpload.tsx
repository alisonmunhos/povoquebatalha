import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { signMissionMediaUpload } from "@/lib/agitation-missions.functions";

export type MissionMedia = {
  media_path: string | null;
  media_mime: string | null;
  media_filename: string | null;
};

export const emptyMissionMedia: MissionMedia = {
  media_path: null,
  media_mime: null,
  media_filename: null,
};

type Props = {
  value: MissionMedia;
  onChange: (value: MissionMedia) => void;
};

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

/** Upload da imagem que os agitadores vão anexar junto da mensagem. */
export function MissionImageUpload({ value, onChange }: Props) {
  const signFn = useServerFn(signMissionMediaUpload);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Formato não aceito. Envie PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Imagem muito grande. O limite é 8 MB.");
      return;
    }
    setBusy(true);
    try {
      const signed = await signFn({ data: { filename: file.name, contentType: file.type } });
      const res = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Falha ao enviar a imagem.");
      setPreviewUrl(URL.createObjectURL(file));
      onChange({ media_path: signed.path, media_mime: file.type, media_filename: signed.filename });
      toast.success("Imagem anexada à missão.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove() {
    setPreviewUrl(null);
    onChange(emptyMissionMedia);
  }

  return (
    <div>
      <Label className="text-xs font-medium">Imagem da missão (opcional)</Label>
      <p className="text-[10px] text-muted-foreground mt-1">
        A imagem aparece como capa na pré-visualização do link dentro da conversa do WhatsApp e
        também fica disponível para o agitador baixar e anexar. Ideal: 1200×630 px. O WhatsApp não
        permite anexar o arquivo automaticamente pelo link.
      </p>


      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {value.media_path ? (
        <div className="mt-2 flex items-center gap-3 rounded-md border p-2">
          {previewUrl && (
            <img src={previewUrl} alt="Imagem da missão" className="h-14 w-14 rounded object-cover" />
          )}
          <span className="text-xs flex-1 truncate">{value.media_filename ?? "Imagem anexada"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <ImagePlus className="h-4 w-4 mr-2" /> Anexar imagem
            </>
          )}
        </Button>
      )}
    </div>
  );
}
