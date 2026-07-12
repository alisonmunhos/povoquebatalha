// Detecta URLs num texto e devolve nós React (texto + <a> clicável intercalados),
// para uso em elementos que já preservam quebra de linha via CSS (white-space:
// pre-wrap) — não mexe em \n, só troca cada URL por um link.
import type { ReactNode } from "react";

const URL_RE = /\bhttps?:\/\/[^\s<>"]+/gi;

export function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noreferrer" className="underline break-all">
        {url}
      </a>,
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts;
}
