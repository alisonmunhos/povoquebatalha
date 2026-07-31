import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getCatalogField, BULK_EDITABLE_FIELD_KEYS } from "@/lib/form-field-catalog";
import { bulkUpdateField } from "@/lib/crm-bulk.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  onApplied: () => void;
};

export function BulkEditFieldModal({ open, onOpenChange, contactIds, onApplied }: Props) {
  const updateFn = useServerFn(bulkUpdateField);
  const [fieldKey, setFieldKey] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Valor genérico: string, boolean, string[]
  const [value, setValue] = useState<string | boolean | string[]>("");

  const field = useMemo(() => (fieldKey ? getCatalogField(fieldKey) : undefined), [fieldKey]);
  const JSONB_COLUMNS = useMemo(() => new Set(["formas_ajuda", "disponibilidade"]), []);

  // Reseta o valor ao trocar de campo
  function onChangeField(key: string) {
    setFieldKey(key);
    const f = getCatalogField(key);
    if (!f) {
      setValue("");
      return;
    }
    if (f.responseType === "yes_no") {
      setValue(true);
    } else if (f.responseType === "multiple_choice") {
      const col = f.targetColumns[0];
      setValue(JSONB_COLUMNS.has(col) ? [] : "");
    } else {
      setValue("");
    }
  }

  const isValid = useMemo(() => {
    if (!field) return false;
    if (field.responseType === "yes_no") return value === true;
    if (field.responseType === "multiple_choice") {
      const col = field.targetColumns[0];
      if (JSONB_COLUMNS.has(col)) return Array.isArray(value) && value.length > 0;
      return value !== "";
    }
    return value !== "";
  }, [field, value, JSONB_COLUMNS]);

  async function onConfirm() {
    if (!field || !isValid) return;
    setSaving(true);
    try {
      const r = await updateFn({ data: { ids: contactIds, fieldKey, value } });
      toast.success(`${r.changed} de ${contactIds.length} contato(s) alterado(s)`);
      onOpenChange(false);
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar edição em massa");
    } finally {
      setSaving(false);
    }
  }

  function renderInput() {
    if (!field) return null;
    if (field.responseType === "yes_no") {
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id="bulk-yesno"
            checked={value === true}
            onCheckedChange={(c) => setValue(c === true)}
          />
          <Label htmlFor="bulk-yesno" className="font-normal cursor-pointer">
            Sim
          </Label>
        </div>
      );
    }
    if (field.responseType === "multiple_choice") {
      const col = field.targetColumns[0];
      const isMulti = JSONB_COLUMNS.has(col);
      const selected = Array.isArray(value) ? value : value ? [value as string] : [];
      const toggle = (v: string) => {
        if (isMulti) {
          setValue((prev) => {
            const arr = Array.isArray(prev) ? prev : prev ? [prev as string] : [];
            return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
          });
        } else {
          setValue(v);
        }
      };
      return (
        <div className="space-y-2 max-h-[260px] overflow-auto border rounded-md p-3">
          {field.options?.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <Checkbox
                id={`opt-${o.value}`}
                checked={selected.includes(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              <Label htmlFor={`opt-${o.value}`} className="font-normal cursor-pointer text-sm">
                {o.label}
              </Label>
            </div>
          ))}
        </div>
      );
    }
    return (
      <Input
        value={typeof value === "string" ? value : ""}
        onChange={(e) => setValue(e.target.value)}
        placeholder={field.defaultHelpText ?? `Digite ${field.defaultLabel.toLowerCase()}`}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar campo em comum</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {contactIds.length} contato(s) selecionado(s). A alteração será aplicada a todos, mas
            dados exclusivos (nome, telefone, e-mail) não serão tocados.
          </p>

          <div className="space-y-1.5">
            <Label>Campo</Label>
            <select
              value={fieldKey}
              onChange={(e) => onChangeField(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">— escolher campo —</option>
              {BULK_EDITABLE_FIELD_KEYS.map((key) => {
                const f = getCatalogField(key);
                if (!f) return null;
                return (
                  <option key={key} value={key}>
                    {f.defaultLabel}
                  </option>
                );
              })}
            </select>
          </div>

          {field && (
            <div className="space-y-1.5">
              <Label>
                Novo valor: <span className="font-normal">{field.defaultLabel.toLowerCase()}</span>
              </Label>
              {renderInput()}
              {field.defaultHelpText && (
                <p className="text-xs text-muted-foreground">{field.defaultHelpText}</p>
              )}
              {fieldKey.startsWith("consentimento") && (
                <p className="text-xs text-amber-600">
                  Consentimentos só podem ser marcados como "Sim" em massa. Para revogar, edite a
                  ficha individual.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={saving || !isValid}>
            {saving ? "Aplicando…" : `Aplicar em ${contactIds.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
