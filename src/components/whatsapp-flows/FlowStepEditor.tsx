// Editor de UMA etapa do roteiro de cadastro pelo WhatsApp.
// Aqui ficam as "regras": o que a etapa faz e para onde cada opção leva.
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCatalogField } from "@/lib/form-field-catalog";
import {
  FLOW_AVAILABLE_FIELDS,
  FLOW_FINISH_ROUTE,
  FLOW_NO_FIELD_KEY,
  FLOW_RESPONSE_KIND_LABELS,
  FLOW_STEP_KIND_LABELS,
  pathLabel,
  stepHasRoutes,
  stepOptions,
  suggestedResponseKind,
  type FlowResponseKind,
  type FlowStepKind,
  type FlowStepLike,
} from "@/lib/whatsapp-flow-shared";

const NEW_PATH = "__new__";

export type FlowStepEditorProps = {
  step: FlowStepLike;
  position: number;
  total: number;
  /** Caminhos existentes para os seletores de destino. */
  paths: string[];
  onChange: (patch: Partial<FlowStepLike>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** Cria um caminho novo (a tela pede o nome) e devolve a chave. */
  onCreatePath: () => string | null;
};

export function FlowStepEditor({
  step,
  position,
  total,
  paths,
  onChange,
  onRemove,
  onMove,
  onCreatePath,
}: FlowStepEditorProps) {
  const field = getCatalogField(step.catalog_field_key);
  const options = stepOptions(step);
  const showRoutes = stepHasRoutes(step);
  const isQuestion = step.kind === "question";

  const setOption = (index: number, label: string) => {
    const list = options.map((o, i) => (i === index ? { ...o, label } : o));
    onChange({ options: list });
  };

  const addOption = () => {
    const value = `opcao_${options.length + 1}`;
    onChange({ options: [...options, { value, label: "Nova opção" }] });
  };

  const removeOption = (index: number) => {
    const removed = options[index];
    const routes = { ...step.option_routes };
    if (removed) delete routes[removed.value];
    onChange({ options: options.filter((_, i) => i !== index), option_routes: routes });
  };

  const setRoute = (value: string, target: string) => {
    const routes = { ...step.option_routes };
    if (target === "__none__") delete routes[value];
    else routes[value] = target;
    onChange({ option_routes: routes });
  };

  return (
    <div className="space-y-3 rounded-lg border-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold">
            {position + 1}. {FLOW_STEP_KIND_LABELS[step.kind]}
          </p>
          <p className="text-muted-foreground text-xs">
            {isQuestion
              ? `Guarda em: ${field?.defaultLabel ?? step.catalog_field_key}`
              : "Não grava campo na ficha."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Subir etapa"
            disabled={position === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Descer etapa"
            disabled={position === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Remover etapa" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label>O que esta etapa faz</Label>
        <Select
          value={step.kind}
          onValueChange={(v) => {
            const kind = v as FlowStepKind;
            if (kind === "question") {
              const key =
                step.catalog_field_key === FLOW_NO_FIELD_KEY
                  ? FLOW_AVAILABLE_FIELDS[0]!.key
                  : step.catalog_field_key;
              onChange({
                kind,
                catalog_field_key: key,
                response_kind: suggestedResponseKind(key),
                option_routes: {},
              });
            } else {
              onChange({ kind, catalog_field_key: FLOW_NO_FIELD_KEY, option_routes: {} });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FLOW_STEP_KIND_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isQuestion ? (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Campo da ficha</Label>
            <Select
              value={step.catalog_field_key}
              onValueChange={(v) =>
                onChange({
                  catalog_field_key: v,
                  response_kind: suggestedResponseKind(v),
                  prompt: step.prompt || getCatalogField(v)?.defaultLabel || "",
                  options: [],
                  option_routes: {},
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOW_AVAILABLE_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.defaultLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tipo de resposta</Label>
            <Select
              value={step.response_kind}
              onValueChange={(v) => onChange({ response_kind: v as FlowResponseKind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FLOW_RESPONSE_KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label>
          {step.kind === "question"
            ? "Pergunta que a pessoa vai ler"
            : step.kind === "menu"
              ? "Texto do menu"
              : "Mensagem enviada nesta etapa"}
        </Label>
        <Textarea
          rows={2}
          value={step.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
        />
      </div>

      {step.kind === "question" ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Obrigatória</span>
          <Switch checked={step.required} onCheckedChange={(v) => onChange({ required: v })} />
        </div>
      ) : null}

      {step.kind === "finish" ? (
        <div className="space-y-1">
          <Label>Como salvar o cadastro</Label>
          <Select
            value={step.option_routes?.["source_form_type"] ?? "cadastro_completo"}
            onValueChange={(v) =>
              onChange({ option_routes: { ...step.option_routes, source_form_type: v } })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cadastro_completo">Cadastro completo</SelectItem>
              <SelectItem value="receber_informacoes">Só receber informações</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {showRoutes ? (
        <div className="space-y-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase">Opções e destinos</Label>
            <Button variant="outline" size="sm" onClick={addOption}>
              <Plus className="mr-1 h-3 w-3" /> Opção
            </Button>
          </div>

          {options.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Sem opções ainda. Adicione as alternativas que a pessoa vai poder tocar.
            </p>
          ) : null}

          {options.map((o, i) => (
            <div key={o.value} className="grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
              <div className="space-y-1">
                <Label className="text-xs">Opção {i + 1}</Label>
                <Input value={o.label} onChange={(e) => setOption(i, e.target.value)} />
                {o.label.length > 24 ? (
                  <p className="text-muted-foreground text-[11px]">
                    O WhatsApp mostra “{o.label.slice(0, 24)}…” no título e o resto na descrição.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Depois desta opção, ir para…</Label>
                <Select
                  value={step.option_routes?.[o.value] ?? "__none__"}
                  onValueChange={(v) => {
                    if (v === NEW_PATH) {
                      const created = onCreatePath();
                      if (created) setRoute(o.value, created);
                      return;
                    }
                    setRoute(o.value, v);
                  }}
                >
                  <SelectTrigger className="md:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Continuar neste caminho</SelectItem>
                    {paths.map((p) => (
                      <SelectItem key={p} value={p}>
                        Ir para: {pathLabel(p)}
                      </SelectItem>
                    ))}
                    <SelectItem value={FLOW_FINISH_ROUTE}>Encerrar e salvar o cadastro</SelectItem>
                    <SelectItem value={NEW_PATH}>Criar novo caminho…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover opção"
                onClick={() => removeOption(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
