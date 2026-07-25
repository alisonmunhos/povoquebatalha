import { CORE_CATALOG_FIELDS, getCatalogField } from "@/lib/form-field-catalog";

export const CORE_CATALOG_FIELD_KEYS = new Set(CORE_CATALOG_FIELDS.map((f) => f.key));

export function isCoreCatalogFieldKey(key: string | null | undefined): boolean {
  return Boolean(key && CORE_CATALOG_FIELD_KEYS.has(key));
}

type SectionLike = { clientKey: string; order_index: number };

export type CoreQuestionDraft = {
  clientKey: string;
  id?: string;
  sectionClientKey: string;
  order_index: number;
  source: "catalog" | "custom";
  catalog_field_key: string | null;
  label: string;
  help_text: string | null;
  link_text: string | null;
  link_url: string | null;
  required: boolean;
  custom_response_type?: string | null;
  custom_options?: unknown;
};

function newClientKey(): string {
  return crypto.randomUUID();
}

/** Garante nome, WhatsApp e consentimento na seção de order_index 0 (Seção 1). */
export function ensureCoreQuestionsInFirstSection<T extends CoreQuestionDraft>(
  sections: SectionLike[],
  questions: T[],
  createKey: () => string = newClientKey,
): T[] {
  const firstSection = sections.find((s) => s.order_index === 0);
  if (!firstSection) return questions;

  const nonCore = questions.filter(
    (q) => !(q.source === "catalog" && isCoreCatalogFieldKey(q.catalog_field_key)),
  );

  const coreByKey = new Map<string, T>();
  for (const q of questions) {
    if (q.source === "catalog" && q.catalog_field_key && isCoreCatalogFieldKey(q.catalog_field_key)) {
      coreByKey.set(q.catalog_field_key, q);
    }
  }

  const mergedCore = CORE_CATALOG_FIELDS.map((f, i) => {
    const existing = coreByKey.get(f.key);
    return {
      clientKey: existing?.clientKey ?? createKey(),
      id: existing?.id,
      sectionClientKey: firstSection.clientKey,
      order_index: i,
      source: "catalog" as const,
      catalog_field_key: f.key,
      label: existing?.label ?? f.defaultLabel,
      help_text: existing?.help_text ?? f.defaultHelpText ?? null,
      link_text: existing?.link_text ?? null,
      link_url: existing?.link_url ?? null,
      required: true,
      custom_response_type: existing?.custom_response_type ?? "short_text",
      custom_options: existing?.custom_options ?? null,
    } as T;
  });

  const firstSectionExtras = nonCore
    .filter((q) => q.sectionClientKey === firstSection.clientKey)
    .map((q, idx) => ({ ...q, order_index: CORE_CATALOG_FIELDS.length + idx }));

  const otherSections = nonCore.filter((q) => q.sectionClientKey !== firstSection.clientKey);

  return [...mergedCore, ...firstSectionExtras, ...otherSections];
}

export function coreFieldLabel(key: string): string {
  return getCatalogField(key)?.defaultLabel ?? key;
}
