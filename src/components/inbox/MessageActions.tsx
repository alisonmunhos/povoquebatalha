import { useState } from "react";
import { Plus } from "lucide-react";
import { EmojiPickerPopover } from "@/components/inbox/EmojiPickerPopover";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * Barra de reação rápida de uma bolha: atalhos fixos + "mais" (seletor
 * completo). Clicar na mesma reação de novo remove (manda emoji vazio).
 * `visible` decide a exibição — o gatilho (hover no desktop, pressionar e
 * segurar no mobile) é resolvido por quem usa este componente.
 */
export function MessageActions({
  align,
  visible,
  currentEmoji,
  disabled,
  disabledReason,
  onReact,
}: {
  align: "start" | "end";
  visible: boolean;
  currentEmoji?: string | null;
  disabled?: boolean;
  disabledReason?: string;
  onReact: (emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function pick(emoji: string) {
    onReact(emoji === currentEmoji ? "" : emoji);
    setPickerOpen(false);
  }

  return (
    <div
      className={`absolute -top-9 z-20 ${align === "end" ? "right-0" : "left-0"} ${
        visible || pickerOpen ? "flex" : "hidden group-hover:md:flex"
      } items-center gap-0.5 rounded-full border bg-background p-1 shadow-md`}
    >
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          disabled={disabled}
          onClick={() => pick(e)}
          className={`rounded-full p-1 text-base leading-none transition hover:scale-110 hover:bg-muted disabled:opacity-40 disabled:hover:scale-100 ${
            currentEmoji === e ? "bg-primary/15" : ""
          }`}
          title={
            disabled
              ? disabledReason
              : currentEmoji === e
                ? `Remover reação ${e}`
                : `Reagir com ${e}`
          }
        >
          {e}
        </button>
      ))}
      <EmojiPickerPopover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        trigger={
          <button
            type="button"
            disabled={disabled}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
            title={disabled ? disabledReason : "Mais emojis"}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
        onPick={pick}
        align={align}
        width={300}
        height={360}
      />
    </div>
  );
}
