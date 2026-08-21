import { Fragment } from "react";

const VAR_REGEX = /\{\{[a-z_]+\}\}/g;

/** Renderiza o corpo de um template destacando variáveis nomeadas ({{nome}}).
 *  Não altera o texto salvo no banco — é puramente visual. */
export function TemplateBodyPreview({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  const parts: Array<{ type: "text" | "var"; content: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(VAR_REGEX)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, index) });
    }
    parts.push({ type: "var", content: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === "var" ? (
          <span
            key={i}
            className="inline-block rounded px-1 py-0.5 bg-primary/15 text-primary font-medium"
          >
            {part.content}
          </span>
        ) : (
          <Fragment key={i}>{part.content}</Fragment>
        ),
      )}
    </span>
  );
}
