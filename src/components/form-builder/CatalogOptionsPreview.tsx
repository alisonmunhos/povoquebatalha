import { isBranchableQuestion, type BranchableQuestion } from "@/lib/form-builder-branching";
import { getEffectiveQuestionShape } from "@/lib/form-question-shape";

type Props = {
  question: BranchableQuestion & { source: string };
};

/** Lista somente-leitura das opções de catálogo quando a pergunta não ramifica. */
export function CatalogOptionsPreview({ question }: Props) {
  if (question.source !== "catalog" || isBranchableQuestion(question)) return null;
  const options = getEffectiveQuestionShape(question).options;
  if (!options?.length) return null;

  return (
    <div className="rounded-md bg-muted/40 p-3 space-y-1">
      <p className="text-xs font-medium">Opções de resposta</p>
      <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
        {options.map((o) => (
          <li key={o.value}>{o.label}</li>
        ))}
      </ul>
    </div>
  );
}
