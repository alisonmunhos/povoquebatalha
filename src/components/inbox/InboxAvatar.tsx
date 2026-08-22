import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Cor determinística a partir de uma string (id/nome). */
export function stringToHslColor(str: string, s = 60, l = 45): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h} ${s}% ${l}%)`;
}

export function initialsFromName(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Avatar do contato no Inbox. A API oficial do WhatsApp não entrega foto de
 * perfil de terceiros, então usamos iniciais com cor determinística; se um dia
 * existir uma foto salva no CRM, ela entra por `photoUrl`.
 */
export function InboxAvatar({
  name,
  seed,
  photoUrl,
  size = 40,
  className = "",
}: {
  name?: string | null;
  seed?: string | null;
  photoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const bg = stringToHslColor((seed ?? "") + (name ?? "sem nome"));
  return (
    <Avatar
      className={`shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {photoUrl && <AvatarImage src={photoUrl} alt={name ?? ""} />}
      <AvatarFallback
        className="font-semibold text-white"
        style={{ backgroundColor: bg, fontSize: Math.max(10, Math.round(size / 2.8)) }}
      >
        {initialsFromName(name)}
      </AvatarFallback>
    </Avatar>
  );
}
