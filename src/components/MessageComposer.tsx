import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip, Loader2, X, Link2, Bold, Italic, Strikethrough, Code2, List, Smile, MousePointerClick, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { signCampaignMediaUpload } from "@/lib/campaigns.functions";
import { fetchLinkPreview, type LinkPreview } from "@/lib/link-preview.functions";
import { MessagePreview } from "@/components/MessagePreview";
import { MESSAGE_VARIABLES, renderMessageVars } from "@/lib/message-vars";
import { EmojiPickerPopover } from "@/components/inbox/EmojiPickerPopover";

// Mesmo formato do modelo Meta (TemplateButton em whatsapp-templates.functions.ts),
// restrito a QUICK_REPLY — único tipo que a Cloud API aceita em mensagem de texto
// livre (via whatsappCloud.sendButtons). Ver messages.functions.ts.
export type ComposerButton = { type: "QUICK_REPLY"; text: string };
const MAX_BUTTONS = 3;
const MAX_BUTTON_CHARS = 20;

// Subconjunto exibido como chips clicáveis no composer (mais enxuto que o wizard).
export const COMPOSER_VARIABLES = [
  "nome",
  "primeiro_nome",
  "cidade",
  "bairro",
  "link_atualizacao",
  "link_inscricao",
] as const satisfies ReadonlyArray<(typeof MESSAGE_VARIABLES)[number]>;

export type ComposerValue = {
  body: string;
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_filename: string | null;
  /** Botões de resposta rápida (opcional). Mutuamente exclusivo com anexo — a
   * mensagem interativa com botões não aceita mídia junto (ver sendButtons). */
  buttons?: ComposerButton[];
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
  buttons: [],
});

type Props = {
  value: ComposerValue;
  onChange: (v: ComposerValue) => void;
  showLink?: boolean;
  showAttachment?: boolean;
  showPreview?: boolean;
  bodyRows?: number;
  bodyPlaceholder?: string;
  /** Lista de variáveis exibidas como chips clicáveis (default: COMPOSER_VARIABLES). */
  variables?: ReadonlyArray<(typeof MESSAGE_VARIABLES)[number]>;
  /** Mostra barra de formatação WhatsApp (negrito/itálico/riscado/mono/lista). */
  showFormatting?: boolean;
  /** Mostra chips de emojis rápidos. */
  showEmojis?: boolean;
  /** Mostra o editor de botões de resposta rápida (até 3, ~20 caracteres). */
  showButtons?: boolean;
};

const QUICK_EMOJIS = ["👋", "🙏", "✅", "❤️", "🎉", "📣", "🗳️", "🔗", "📍", "⏰", "😀", "👍", "🔥"];

/** Renderiza variáveis com valores de exemplo (mesmo motor usado no envio real). */
function renderExample(body: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return renderMessageVars(
    body,
    { nome: "Marina Silva", cidade: "Curitiba", bairro: "Centro", uf: "PR", recad_token: "exemplo" },
    { origin, unknownAsEmpty: true },
  );
}


export function MessageComposer({
  value,
  onChange,
  showLink = true,
  showAttachment = true,
  showPreview = true,
  bodyRows = 7,
  bodyPlaceholder = "Escreva sua mensagem. Use as variáveis abaixo para personalizar.",
  variables = COMPOSER_VARIABLES,
  showFormatting = true,
  showEmojis = true,
  showButtons = true,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const signUpload = useServerFn(signCampaignMediaUpload);
  const previewFn = useServerFn(fetchLinkPreview);
  const [uploading, setUploading] = useState(false);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

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

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      onChange({ ...value, body: (value.body ?? "") + text });
      return;
    }
    const start = el.selectionStart ?? value.body.length;
    const end = el.selectionEnd ?? value.body.length;
    const next = value.body.slice(0, start) + text + value.body.slice(end);
    onChange({ ...value, body: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function wrapSelection(before: string, after: string = before) {
    const el = textareaRef.current;
    if (!el) {
      onChange({ ...value, body: (value.body ?? "") + before + after });
      return;
    }
    const start = el.selectionStart ?? value.body.length;
    const end = el.selectionEnd ?? value.body.length;
    const sel = value.body.slice(start, end);
    const next = value.body.slice(0, start) + before + sel + after + value.body.slice(end);
    onChange({ ...value, body: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + before.length + sel.length + after.length;
      el.setSelectionRange(sel ? pos : start + before.length, pos);
    });
  }

  function insertVariable(name: string) {
    insertAtCursor(`{{${name}}}`);
  }


  async function onAttach(file: File) {
    // Alinhado ao limite usado pelo mesmo tipo de anexo no Inbox (CommunicationInbox.tsx) —
    // os dois usam o mesmo bucket/upload (signCampaignMediaUpload), então o limite não
    // deveria divergir: um PDF que passa no Inbox tem que passar aqui também.
    if (file.size > 15 * 1024 * 1024) return toast.error("Arquivo acima de 15MB");
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
  const buttons = value.buttons ?? [];
  const hasAttachment = Boolean(attachment);

  function addButton() {
    if (buttons.length >= MAX_BUTTONS) return;
    onChange({ ...value, buttons: [...buttons, { type: "QUICK_REPLY", text: "" }] });
  }
  function updateButton(idx: number, text: string) {
    onChange({
      ...value,
      buttons: buttons.map((b, i) => (i === idx ? { ...b, text: text.slice(0, MAX_BUTTON_CHARS) } : b)),
    });
  }
  function removeButton(idx: number) {
    onChange({ ...value, buttons: buttons.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium">Mensagem</label>
        {(showFormatting || showEmojis) && (
          <div className="mt-1 flex flex-wrap items-center gap-1 border rounded-md p-1 bg-muted/30">
            {showFormatting && (
              <>
                <button type="button" title="Negrito (*texto*)" onClick={() => wrapSelection("*")} className="p-1.5 rounded hover:bg-background"><Bold className="h-3.5 w-3.5" /></button>
                <button type="button" title="Itálico (_texto_)" onClick={() => wrapSelection("_")} className="p-1.5 rounded hover:bg-background"><Italic className="h-3.5 w-3.5" /></button>
                <button type="button" title="Riscado (~texto~)" onClick={() => wrapSelection("~")} className="p-1.5 rounded hover:bg-background"><Strikethrough className="h-3.5 w-3.5" /></button>
                <button type="button" title="Monoespaçado (```texto```)" onClick={() => wrapSelection("```")} className="p-1.5 rounded hover:bg-background"><Code2 className="h-3.5 w-3.5" /></button>
                <button type="button" title="Lista" onClick={() => insertAtCursor("\n- ")} className="p-1.5 rounded hover:bg-background"><List className="h-3.5 w-3.5" /></button>
              </>
            )}
            {showFormatting && showEmojis && <span className="w-px h-4 bg-border mx-1" />}
            {showEmojis && (
              <div className="flex items-center gap-1 pl-1">
                <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                {QUICK_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => insertAtCursor(e)} className="text-base leading-none hover:scale-110 transition p-0.5" title={`Inserir ${e}`}>{e}</button>
                ))}
                <EmojiPickerPopover
                  open={emojiPickerOpen}
                  onOpenChange={setEmojiPickerOpen}
                  trigger={
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-background text-muted-foreground"
                      title="Mais emojis"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  }
                  onPick={(emoji) => {
                    insertAtCursor(emoji);
                    setEmojiPickerOpen(false);
                  }}
                  width={280}
                  height={320}
                />
              </div>
            )}
          </div>
        )}
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
          {variables.map((v) => (
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
              <label className="text-xs font-medium">Anexo (PNG/JPG/WEBP ou PDF, até 15MB)</label>
              {buttons.length > 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground border border-dashed rounded-md px-3 py-2">
                  Indisponível com botões configurados — mensagem com botões não aceita anexo.
                </p>
              ) : value.media_path ? (
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

      {showButtons && (
        <div>
          <label className="text-xs font-medium flex items-center gap-1">
            <MousePointerClick className="h-3.5 w-3.5" /> Botões de resposta rápida (opcional)
          </label>
          {hasAttachment ? (
            <p className="mt-1 text-[11px] text-muted-foreground border border-dashed rounded-md px-3 py-2">
              Indisponível com anexo configurado — mensagem com anexo não aceita botões.
            </p>
          ) : (
            <div className="mt-1 space-y-1.5">
              {buttons.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={b.text}
                    onChange={(e) => updateButton(idx, e.target.value)}
                    placeholder={`Botão ${idx + 1} (até ${MAX_BUTTON_CHARS} caracteres)`}
                    maxLength={MAX_BUTTON_CHARS}
                    className="flex-1 rounded-md border px-3 py-1.5 text-sm bg-background"
                  />
                  <button
                    type="button"
                    onClick={() => removeButton(idx)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                    title="Remover botão"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {buttons.length < MAX_BUTTONS && (
                <button
                  type="button"
                  onClick={addButton}
                  className="inline-flex items-center gap-1 text-[11px] rounded-md border border-dashed px-2 py-1 text-muted-foreground hover:bg-muted/40"
                >
                  <Plus className="h-3 w-3" /> Adicionar botão
                </button>
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
              buttons={hasAttachment ? [] : buttons}
            />
          </div>
        </div>
      )}
    </div>
  );
}
