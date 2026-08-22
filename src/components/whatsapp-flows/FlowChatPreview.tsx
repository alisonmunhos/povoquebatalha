// Prévia de como o caminho aparece na conversa do WhatsApp.
import { Bot } from "lucide-react";
import {
  FLOW_MULTI_DONE_LABEL,
  shortRowTitle,
  stepOptions,
  type FlowStepLike,
} from "@/lib/whatsapp-flow-shared";

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card max-w-[90%] space-y-2 rounded-2xl rounded-tl-sm border-2 px-3 py-2 text-sm shadow-sm">
      {children}
    </div>
  );
}

export function FlowChatPreview({
  openingMessage,
  steps,
  showOpening,
}: {
  openingMessage?: string;
  steps: FlowStepLike[];
  showOpening?: boolean;
}) {
  return (
    <div className="bg-muted/40 space-y-3 rounded-xl border-2 p-3">
      <p className="text-muted-foreground flex items-center gap-2 text-xs font-semibold uppercase">
        <Bot className="h-4 w-4" /> Prévia da conversa
      </p>

      {showOpening && openingMessage ? (
        <Bubble>
          <p className="whitespace-pre-wrap">{openingMessage}</p>
        </Bubble>
      ) : null}

      {steps.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma etapa neste caminho ainda. Adicione a primeira pergunta.
        </p>
      ) : null}

      {steps.map((step, i) => {
        const options = stepOptions(step);
        const asButtons = options.length > 0 && options.length <= 3;
        return (
          <Bubble key={step.id ?? `${step.catalog_field_key}-${i}`}>
            <p className="whitespace-pre-wrap">{step.prompt || "(sem texto)"}</p>

            {step.response_kind === "multi_choice" && options.length ? (
              <p className="text-muted-foreground text-xs">
                {options.map((o, idx) => `${idx + 1}. ${o.label}`).join("\n")}
                {"\n"}Responda com os números, separados por vírgula (ex.: 1, 3).
              </p>
            ) : null}

            {options.length ? (
              asButtons ? (
                <div className="flex flex-wrap gap-1">
                  {options.map((o) => (
                    <span
                      key={o.value}
                      className="text-primary rounded-md border-2 px-2 py-1 text-xs font-semibold"
                    >
                      {shortRowTitle(o.label)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="text-primary block rounded-md border-2 px-2 py-1 text-center text-xs font-semibold">
                    Ver opções
                  </span>
                  <ul className="text-muted-foreground space-y-0.5 text-xs">
                    {options.map((o) => (
                      <li key={o.value}>
                        <span className="font-medium">{shortRowTitle(o.label)}</span>
                        {o.label.length > 24 ? <span> — {o.label.slice(0, 72)}</span> : null}
                      </li>
                    ))}
                    {step.response_kind === "multi_choice" ? <li>{FLOW_MULTI_DONE_LABEL}</li> : null}
                  </ul>
                </div>
              )
            ) : null}

            {step.kind === "handoff" ? (
              <p className="text-muted-foreground text-xs">
                Aqui a conversa fica “Em aberto” no Inbox para atendimento humano.
              </p>
            ) : null}
            {step.kind === "finish" ? (
              <p className="text-muted-foreground text-xs">
                Aqui o cadastro é salvo e a conversa termina.
              </p>
            ) : null}
          </Bubble>
        );
      })}
    </div>
  );
}
