import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  signFormHeaderImageUpload,
  getFormHeaderImageUrl,
} from "@/lib/form-definitions.functions";

export type FormHeaderImage = {
  header_image_path: string | null;
  header_image_mime: string | null;
};

export const emptyFormHeaderImage: FormHeaderImage = {
  header_image_path: null,
  header_image_mime: null,
};

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

type Props = {
  formDefinitionId: string;
  value: FormHeaderImage;
  onChange: (value: FormHeaderImage) => void;
};

/** Imagem exibida na primeira tela do formulário público e na prévia do link. */
export function FormHeaderImageUpload({ formDefinitionId, value, onChange }: Props) {
  const signFn = useServerFn(signFormHeaderImageUpload);
  const urlFn = useServerFn(getFormHeaderImageUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const path = value.header_image_path;

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setPreviewUrl(null);
      return;
    }
    urlFn({ data: { path } })
      .then((r) => {
        if (!cancelled) setPreviewUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path, urlFn]);

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
      const signed = await signFn({
        data: { form_definition_id: formDefinitionId, filename: file.name, contentType: file.type },
      });
      const res = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Falha ao enviar a imagem.");
      setLocalPreview(URL.createObjectURL(file));
      onChange({ header_image_path: signed.path, header_image_mime: file.type });
      toast.success("Imagem enviada. Clique em “Salvar formulário” para aplicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove() {
    setLocalPreview(null);
    setPreviewUrl(null);
    onChange(emptyFormHeaderImage);
  }

  const shown = localPreview ?? previewUrl;

  return (
    <div>
      <label className="text-sm font-medium">Imagem de cabeçalho (opcional)</label>
      <p className="text-xs text-muted-foreground mt-1">
        Aparece apenas na primeira tela do formulário, logo abaixo do título, e vira a capa da
        pré-visualização do link no WhatsApp. Aceita PNG, JPG ou WEBP até 8 MB — imagens verticais
        são preservadas inteiras na prévia.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Escolher imagem de cabeçalho do formulário"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {shown ? (
        <div className="mt-3 space-y-2">
          <img
            src={shown}
            alt="Pré-visualização da imagem de cabeçalho do formulário"
            className="w-full max-w-xs rounded-lg border-2 border-border object-contain"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Trocar imagem
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={remove}>
              <X className="h-4 w-4" /> Remover imagem
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? "Enviando…" : "Anexar imagem"}
        </Button>
      )}
    </div>
  );
}
