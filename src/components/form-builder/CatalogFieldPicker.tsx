import { CONSENT_CATALOG_GROUP, CONSENT_CATALOG_GROUP_KEYS } from "@/lib/legal-consent-fields";
import { FORM_FIELD_CATALOG, getCatalogField, type FormCatalogField } from "@/lib/form-field-catalog";

type Props = {
  usedCatalogKeys: Set<string>;
  /** Em formulários flat, campos core já estão no formulário e não aparecem no picker. */
  hideCoreInConsentGroup?: boolean;
  onAdd: (field: FormCatalogField) => void;
};

export default function CatalogFieldPicker({ usedCatalogKeys, hideCoreInConsentGroup, onAdd }: Props) {
  const generalFields = FORM_FIELD_CATALOG.filter(
    (f) => !f.core && !CONSENT_CATALOG_GROUP_KEYS.has(f.key) && !usedCatalogKeys.has(f.key),
  );

  const consentFields = CONSENT_CATALOG_GROUP.fields.filter((entry) => {
    if (usedCatalogKeys.has(entry.key)) return false;
    if (hideCoreInConsentGroup && getCatalogField(entry.key)?.core) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {generalFields.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {generalFields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onAdd(f)}
              className="text-xs px-3 py-1.5 border rounded-full hover:bg-muted/60"
            >
              {f.defaultLabel}
            </button>
          ))}
        </div>
      )}

      {consentFields.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-dashed">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            {CONSENT_CATALOG_GROUP.title}
          </p>
          <div className="flex flex-wrap gap-2">
            {consentFields.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  const field = getCatalogField(entry.key);
                  if (field) onAdd(field);
                }}
                className="text-xs px-3 py-1.5 border rounded-full hover:bg-muted/60"
              >
                {entry.pickerLabel}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
