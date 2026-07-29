import type { SuccessScreenOrder } from "@/lib/form-sections.types";

export type SuccessBlock =
  | { type: "whatsapp"; url: string; showFollowUpHint?: boolean }
  | { type: "confirmation" }
  | { type: "push"; contactId: string };

export function buildSuccessBlocks(input: {
  whatsappUrl: string | null;
  confirmationEnabled: boolean;
  pushEnabled: boolean;
  contactId: string | null;
  order: SuccessScreenOrder;
}): SuccessBlock[] {
  const whatsapp: SuccessBlock | null = input.whatsappUrl
    ? { type: "whatsapp", url: input.whatsappUrl }
    : null;
  const confirmation: SuccessBlock | null = input.confirmationEnabled ? { type: "confirmation" } : null;
  const push: SuccessBlock | null =
    input.pushEnabled && input.contactId ? { type: "push", contactId: input.contactId } : null;

  const ordered =
    input.order === "confirmation_first" ? [confirmation, push, whatsapp] : [whatsapp, push, confirmation];

  return ordered.filter((b): b is SuccessBlock => b != null);
}
