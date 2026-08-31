import { lazy, Suspense, type ReactNode } from "react";
import { SkinTonePickerLocation, SkinTones, type EmojiClickData } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const SKIN_TONE_KEY = "inbox.emojiSkinTone";
const VALID_SKIN_TONES = new Set<string>(Object.values(SkinTones));

function loadSkinTone(): SkinTones {
  if (typeof window === "undefined") return SkinTones.NEUTRAL;
  try {
    const v = window.localStorage.getItem(SKIN_TONE_KEY);
    return v && VALID_SKIN_TONES.has(v) ? (v as SkinTones) : SkinTones.NEUTRAL;
  } catch {
    return SkinTones.NEUTRAL;
  }
}

function saveSkinTone(tone: SkinTones) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SKIN_TONE_KEY, tone);
  } catch {
    /* storage indisponível (modo privado etc.) — não impede o uso do seletor */
  }
}

/**
 * Seletor de emoji compartilhado (composer do Inbox, editor de mensagens e
 * barra de reação): busca habilitada e seletor de tom de pele, persistido
 * por navegador em localStorage.
 */
export function EmojiPickerPopover({
  open,
  onOpenChange,
  trigger,
  onPick,
  align = "end",
  width = 300,
  height = 360,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  onPick: (emoji: string) => void;
  align?: "start" | "center" | "end";
  width?: number;
  height?: number;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0" sideOffset={8}>
        <Suspense
          fallback={<div className="p-4 text-sm text-muted-foreground">Carregando emojis…</div>}
        >
          <EmojiPicker
            onEmojiClick={(data: EmojiClickData) => {
              if (data.emoji) onPick(data.emoji);
            }}
            width={width}
            height={height}
            lazyLoadEmojis
            skinTonesDisabled={false}
            skinTonePickerLocation={SkinTonePickerLocation.PREVIEW}
            defaultSkinTone={loadSkinTone()}
            onSkinToneChange={(tone: SkinTones) => saveSkinTone(tone)}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
