// Metadados dos consentimentos legais (LGPD) — separados do consentimento de WhatsApp.
// WhatsApp tem comportamento próprio (core, gate de envio) e entra só no agrupamento visual.

/** Chaves de catálogo dos consentimentos legais (não inclui WhatsApp). */
export const LEGAL_CONSENT_KEYS = [
  "consentimento_lgpd",
  "consentimento_dados_sensiveis",
] as const;

export type LegalConsentCatalogKey = (typeof LEGAL_CONSENT_KEYS)[number];

export function isLegalConsentCatalogKey(key: string): key is LegalConsentCatalogKey {
  return (LEGAL_CONSENT_KEYS as readonly string[]).includes(key);
}

/** Nome jurídico completo — catálogo, ficha, enunciado default. */
export const LEGAL_CONSENT_FICHA_LABELS: Record<LegalConsentCatalogKey, string> = {
  consentimento_lgpd:
    "Consentimento LGPD (tratamento de dados pessoais)",
  consentimento_dados_sensiveis:
    "Consentimento para Tratamento de Dados Pessoais Sensíveis",
};

/** Rótulo curto — filtros, chips, picker do construtor. */
export const LEGAL_CONSENT_FILTER_LABELS: Record<LegalConsentCatalogKey, string> = {
  consentimento_lgpd: "LGPD",
  consentimento_dados_sensiveis: "Dados Sensíveis",
};

/** Chave de catálogo do consentimento WhatsApp (comunicação, não legal). */
export const WHATSAPP_CONSENT_CATALOG_KEY = "consentimento" as const;

/** Agrupamento visual no construtor de formulários — os três sempre juntos. */
export const CONSENT_CATALOG_GROUP = {
  id: "consentimentos",
  title: "CONSENTIMENTOS",
  fields: [
    { key: WHATSAPP_CONSENT_CATALOG_KEY, pickerLabel: "WhatsApp" },
    { key: "consentimento_lgpd" as const, pickerLabel: "LGPD" },
    { key: "consentimento_dados_sensiveis" as const, pickerLabel: "Dados Sensíveis" },
  ],
} as const;

export const CONSENT_CATALOG_GROUP_KEYS: ReadonlySet<string> = new Set<string>(
  CONSENT_CATALOG_GROUP.fields.map((f) => f.key),
);
