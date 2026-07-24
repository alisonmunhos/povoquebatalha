import { Plus, Trash2 } from "lucide-react";
import type { CustomOption, CustomResponseType } from "@/lib/form-question-shape";

export type CustomQuestionDraft = {
  custom_response_type?: CustomResponseType | null;
  custom_options?: CustomOption[] | null;
};

type Props = {
  value: CustomQuestionDraft;
  onChange: (patch: Partial<CustomQuestionDraft>) => void;
};

export function CustomQuestionFields({ value, onChange }: Props) {
  const responseType: CustomResponseType =
    value.custom_response_type === "single_choice" ? "single_choice" : "short_text";
  const options = value.custom_options ?? [];

  function setType(next: CustomResponseType) {
    if (next === "short_text") {
      onChange({ custom_response_type: "short_text", custom_options: null });
      return;
    }
    onChange({
      custom_response_type: "single_choice",
      custom_options: options.length >= 2 ? options : [
        { value: "opcao-1", label: "" },
        { value: "opcao-2", label: "" },
      ],
    });
  }

  function updateOptionLabel(index: number, label: string) {
    const next = [...options];
    next[index] = { ...next[index], label };
    onChange({ custom_options: next });
  }

  function addOption() {
    onChange({
      custom_options: [...options, { value: `opcao-${options.length + 1}`, label: "" }],
    });
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    onChange({ custom_options: options.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3">
      <div>
        <label className="text-xs font-medium">Tipo de resposta</label>
        <select
          value={responseType}
          onChange={(e) => setType(e.target.value as CustomResponseType)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="short_text">Texto livre</option>
          <option value="single_choice">Escolha única (uma alternativa)</option>
        </select>
      </div>

      {responseType === "single_choice" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Alternativas (mínimo 2)</p>
          {options.map((opt, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={opt.label}
                onChange={(e) => updateOptionLabel(index, e.target.value)}
                placeholder={`Alternativa ${index + 1}`}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={options.length <= 2}
                onClick={() => removeOption(index)}
                className="p-1.5 hover:bg-destructive/10 text-destructive rounded disabled:opacity-30"
                title="Remover alternativa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar alternativa
          </button>
        </div>
      )}
    </div>
  );
}
