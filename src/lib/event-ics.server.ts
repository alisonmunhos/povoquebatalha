type IcsEvent = {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  slug: string;
};

function dtIcs(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildEventIcs(event: IcsEvent, uid?: string): string {
  const start = event.starts_at;
  const end = event.ends_at ?? new Date(new Date(start).getTime() + 3600_000).toISOString();
  const description = (event.description ?? "").replace(/\n/g, "\\n");
  const location = event.location ?? "";
  const eventUid = uid ?? `event-${event.slug}@povoquebatalha`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PovoQueBatalha//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${dtIcs(new Date().toISOString())}`,
    `DTSTART:${dtIcs(start)}`,
    `DTEND:${dtIcs(end)}`,
    `SUMMARY:${event.title}`,
    description ? `DESCRIPTION:${description}` : null,
    location ? `LOCATION:${location}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}
