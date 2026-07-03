import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip, Loader2, X, Link2 } from "lucide-react";
import { toast } from "sonner";
import { signCampaignMediaUpload } from "@/lib/campaigns.functions";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview.functions";
import { MessagePreview } from "@/components/MessagePreview";

export const COMPOSER_VARIABLES = [
  "nome",
  "primeiro_nome",
  "cidade",
  "bairro",
  "link_atualizacao",
  "link_inscricao",
] as const;

export type ComposerValue = {
  body: string;
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_filename: string | null;
};

export const emptyComposerValue = (): ComposerValue => ({
  body: "",
  link_url: null,
  link_title: null,
  link_description: null,
  link_image: null,
  media_path: null,
  media_mime: null,
  media_filename: null,
});

type Props = {
  value: ComposerValue;
  onChange: (v: ComposerValue) => void;
  showLink?: boolean;
  showAttachment?: boolean;
  showPreview?: boolean;
  bodyRows?: number;
  bodyPlaceholder?: string;
};

/** Renderiza variáveis com valores de exemplo (mesmo estilo usado no envio real de teste). */
function renderExample(body: string): string {
  return body
    .replace(/\{\{\s*nome\s*\}\}/gi, "Marina")
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, "Marina")
    .replace(/\{\{\s*cidade\s*\}\}/gi, "Curitiba")
    .replace(/\{\{\s*bairro\s*\}\}/gi, "Centro")
    .replace(/\{\{\s*link_atualizacao\s*\}\}/gi, "https://povoquebatalha.lovable.app/recadastro?t=exemplo")
    .replace(/\{\{\s*link_inscricao\s*\}\}/gi, "https://povoquebatalha.lovable.app/inscrever");
}

export function MessageComposer({
  value,
  onChange,
  showLink = true,
  showAttachment = true,
  showPreview = true,
  bodyRows = 7,
  bodyPlaceholder = "Escreva sua mensagem. Use as variáveis abaixo para personalizar.",
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const signUpload = useServerFn(signCampaignMediaUpload);
  const previewFn = useServerFn(fetchLinkPreview);
  const [uploading, setUploading] = useState(false);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  // Debounced link preview
  useEffect(() => {
    const url = (value.link_url ?? "").trim();
    if (!url) {
      setLinkPreview(null);
      return;
    }
    let cancelled = false;
    setLinkLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await previewFn({ data: { url } });
        if (cancelled) return;
        setLinkPreview(r);
        // Auto-preenche metadata quando confirmada
        onChange({
          ...value,
          link_title: r.title ?? value.link_title ?? null,
          link_description: r.description ?? value.link_description ?? null,
          link_image: r.image ?? value.link_image ?? null,
        });
      } catch {
        if (!cancelled) setLinkPreview(null);
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.link_url]);

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    const el = textareaRef.current;
    if (!el) {
      onChange({ ...value, body: (value.body ?? "") + token });
      return;
    }
    const start = el.selectionStart ?? value.body.length;
    const end = el.selectionEnd ?? value.body.length;
    const next = value.body.slice(0, start) + token + value.body.slice(end);
    onChange({ ...value, body: next });
    // reposiciona cursor após inserção
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function onAttach(file: File) {
    if (file.size > 8 * 1024 * 1024) return toast.error("Arquivo acima de 8MB");
    setUploading(true);
    try {
      const sig = await signUpload({ data: { filename: file.name, contentType: file.type } });
      const up = await fetch(sig.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": sig.contentType, "x-upsert": "true" },
        body: file,
      });
      if (!up.ok) throw new Error(`Falha no upload (${up.status})`);
      onChange({
        ...value,
        media_path: sig.path,
        media_mime: sig.contentType,
        media_filename: sig.filename,
      });
      toast.success("Anexo carregado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  }

  const previewBody = renderExample(value.body || "");
  const attachment =
    value.media_path && value.media_mime
      ? { filename: value.media_filename ?? value.media_path, mime: value.media_mime }
      : null;

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium">Mensagem</label>
        <textarea
          ref={textareaRef}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          rows={bodyRows}
          placeholder={bodyPlaceholder}
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background font-mono"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground mr-1">Inserir variável:</span>
          {COMPOSER_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="text-[11px] rounded-full border border-primary/30 bg-primary/5 text-primary px-2 py-0.5 hover:bg-primary/10"
              title={`Inserir {{${v}}}`}
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>

      {(showLink || showAttachment) && (
        <div className="grid md:grid-cols-2 gap-3">
          {showLink && (
            <div>
              <label className="text-xs font-medium flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" /> Link (aparece com prévia)
              </label>
              <input
                type="url"
                value={value.link_url ?? ""}
                onChange={(e) => onChange({ ...value, link_url: e.target.value || null })}
                placeholder="https://..."
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Se a prévia carregar abaixo (título/imagem), o envio usa <code>/send-link</code> e a prévia é garantida. Sem OG, o WhatsApp tenta gerar sozinho.
              </p>
              {linkPreview && !linkPreview.image && (value.link_url ?? "").length > 0 && (
                <p className="text-[10px] text-amber-700 mt-1">
                  Sem imagem OG detectada. O WhatsApp pode não mostrar prévia. Verifique <a className="underline" href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(value.link_url ?? "")}`} target="_blank" rel="noreferrer">o cache do link</a> ou peça ao site para adicionar <code>og:image</code> &lt; 300&nbsp;KB.
                </p>
              )}
            </div>
          )}
          {showAttachment && (
            <div>
              <label className="text-xs font-medium">Anexo (PNG/JPG/WEBP ou PDF, até 8MB)</label>
              {value.media_path ? (
                <div className="mt-1 flex items-center gap-2 rounded-md border px-3 py-2 text-xs bg-muted/30">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{value.media_filename ?? value.media_path}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({ ...value, media_path: null, media_mime: null, media_filename: null })
                    }
                    className="text-destructive hover:underline"
                    title="Remover anexo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="mt-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs cursor-pointer hover:bg-muted/40">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  <span>{uploading ? "Enviando…" : "Escolher arquivo"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onAttach(f);
                    }}
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {showPreview && (
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">
            Pré-visualização (como o contato verá)
          </div>
          <div className="rounded-md border bg-[#e5ddd5] p-3">
            <MessagePreview
              text={previewBody}
              linkPreview={linkPreview}
              linkLoading={linkLoading}
              attachment={attachment}
            />
          </div>
        </div>
      )}
    </div>
  );
}
