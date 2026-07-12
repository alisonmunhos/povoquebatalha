import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCatalogField } from "@/lib/form-field-catalog";
import { updateSchema } from "@/lib/contacts.functions";

const inputSchema = z.object({
  contactId: z.string().uuid(),
  fieldKey: z.string(),
  value: z.any(),
});

export const updateContactField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { contactId, fieldKey, value } = data;

    const field = getCatalogField(fieldKey);
    if (!field) return { success: false, error: `InvalidFieldKey: ${fieldKey}` };

    if (field.targetColumns.includes("phone_raw") || fieldKey === "whatsapp") {
      return { success: false, error: "Editar telefone exige o fluxo dedicado, não a célula" };
    }

    if (field.targetColumns.length !== 1) {
      return { success: false, error: `Field maps to multiple columns; use full edit for: ${fieldKey}` };
    }
    const mappedColumn = field.targetColumns[0];

    try {
      const pickSchema = (updateSchema as any).pick({ [mappedColumn]: true });
      pickSchema.parse({ [mappedColumn]: value });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        return { success: false, error: `ValidationError: ${err.message}` };
      }
      throw err;
    }

    const { data: prevRow, error: prevErr } = await context.supabase
      .from("contacts")
      .select(mappedColumn)
      .eq("id", contactId)
      .single();
    if (prevErr) {
      return { success: false, error: "NotFound: contact not found" };
    }
    const beforeValue = (prevRow as unknown as Record<string, unknown>)[mappedColumn];

    const payload: Record<string, unknown> = { [mappedColumn]: value };
    const { data: updatedRow, error: updateErr } = await context.supabase
      .from("contacts")
      .update(payload as never)
      .eq("id", contactId)
      .select()
      .single();
    if (updateErr) {
      return { success: false, error: `Update failed: ${updateErr.message ?? String(updateErr)}` };
    }

    const afterValue = (updatedRow as Record<string, unknown>)[mappedColumn];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      changes[mappedColumn] = { from: beforeValue ?? null, to: afterValue ?? null };
      await context.supabase.from("contact_audit_log").insert({
        contact_id: contactId,
        user_id: context.userId,
        action: "update",
        changes: changes as never,
      });
    }

    return { success: true, updatedValue: afterValue as any, updatedAt: (updatedRow as any).updated_at as string };
  });
