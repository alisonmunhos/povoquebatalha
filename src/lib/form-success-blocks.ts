import type { SuccessScreenOrder } from "@/lib/form-sections.types";

export type SuccessBlock =
  | { type: "whatsapp"; url: string; showFollowUpHint?: boolean }
  | { type: "confirmation" }
  | { type: "push"; contactId: string }
  | { type: "event"; slug: string; title: string; contactToken?: string | null };

export function buildSuccessBlocks(input: {
  whatsappUrl: string | null;
  confirmationEnabled: boolean;
  pushEnabled: boolean;
  contactId: string | null;
  linkedEvent: { slug: string; title: string } | null;
  contactToken?: string | null;
  order: SuccessScreenOrder;
}): SuccessBlock[] {
  const whatsapp: SuccessBlock | null = input.whatsappUrl
    ? { type: "whatsapp", url: input.whatsappUrl }
    : null;
  const confirmation: SuccessBlock | null = input.confirmationEnabled ? { type: "confirmation" } : null;
  const push: SuccessBlock | null =
    input.pushEnabled && input.contactId ? { type: "push", contactId: input.contactId } : null;
  const event: SuccessBlock | null = input.linkedEvent
    ? {
        type: "event",
        slug: input.linkedEvent.slug,
        title: input.linkedEvent.title,
        contactToken: input.contactToken ?? null,
      }
    : null;

  const ordered =
    input.order === "confirmation_first"
      ? [confirmation, push, event, whatsapp]
      : [whatsapp, push, event, confirmation];

  return ordered.filter((b): b is SuccessBlock => b != null);
}
