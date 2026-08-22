// Lista de caminhos da conversa (equivalente às seções do construtor de formulário).
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FLOW_DEFAULT_PATH,
  FLOW_FINISH_ROUTE,
  pathLabel,
  stepHasRoutes,
  stepOptions,
  type FlowPathGroup,
  type FlowStepLike,
} from "@/lib/whatsapp-flow-shared";

export function FlowPathList({
  groups,
  selected,
  onSelect,
  onRename,
  onCreate,
}: {
  groups: FlowPathGroup<FlowStepLike>[];
  selected: string;
  onSelect: (key: string) => void;
  onRename: (key: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Caminhos da conversa</p>
        <Button variant="outline" size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-3 w-3" /> Caminho
        </Button>
      </div>

      {groups.map((g) => {
        const rules = g.steps.flatMap((s) =>
          stepHasRoutes(s)
            ? stepOptions(s)
                .filter((o) => s.option_routes?.[o.value])
                .map((o) => ({
                  option: o.label,
                  target: s.option_routes[o.value]!,
                }))
            : [],
        );
        const active = g.key === selected;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onSelect(g.key)}
            className={cn(
              "w-full space-y-1 rounded-lg border-2 p-3 text-left transition",
              active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {pathLabel(g.key)}
                {g.key === FLOW_DEFAULT_PATH ? <Badge variant="secondary">início</Badge> : null}
              </span>
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                {g.steps.length} etapa{g.steps.length === 1 ? "" : "s"}
                <ChevronRight className="h-3 w-3" />
              </span>
            </div>

            {rules.length ? (
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                {rules.slice(0, 4).map((r, i) => (
                  <li key={`${r.option}-${i}`}>
                    Se responder <span className="font-medium">{r.option}</span> →{" "}
                    {r.target === FLOW_FINISH_ROUTE ? "encerrar e salvar" : pathLabel(r.target)}
                  </li>
                ))}
                {rules.length > 4 ? <li>+ {rules.length - 4} regra(s)</li> : null}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">Sem ramificações: segue em ordem.</p>
            )}

            {g.key !== FLOW_DEFAULT_PATH ? (
              <span
                role="button"
                tabIndex={0}
                className="text-primary inline-flex items-center gap-1 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onRename(g.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onRename(g.key);
                  }
                }}
              >
                <Pencil className="h-3 w-3" /> Renomear
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
