# Reconectar o GitHub na conta certa e conferir o que desceu

A reconexão do GitHub é uma ação da interface do Lovable, ligada à sua conta — eu não consigo executá-la daqui. Daqui de dentro eu só enxergo o repositório interno do Lovable. Então o fluxo é: você reconecta, eu confiro.

## Passo 1 — Você reconecta (interface do Lovable)

1. Menu **+** (canto inferior esquerdo do chat) → **GitHub**.
2. Se a conta conectada não for `alisonmunhos`: **Desconectar**. Se precisar trocar de conta de verdade, revogue o app "Lovable" em https://github.com/settings/applications e conecte de novo.
3. **Connect project** → escolher a conta `alisonmunhos` → escolher o repositório `whatsapp-connect`.
4. Confirmar que a branch de sincronização é `main`.

Atenção antes de confirmar: se `whatsapp-connect` já tiver um histórico diferente do projeto atual, a ligação pode gerar divergência. Me avise o que a tela mostrar antes de concluir, se aparecer qualquer aviso de conflito ou de repositório não vazio.

## Passo 2 — Eu confiro o que desceu

Assim que você avisar que reconectou:

- listo os commits novos que entraram e de quais PRs vieram;
- checo conflitos ou sobrescritas nos arquivos mexidos aqui durante a pausa (`src/lib/communication.functions.ts`, `src/integrations/whatsapp-cloud/client.server.ts`, `src/integrations/supabase/types.ts`);
- verifico migrations que vieram nos PRs e ainda não foram aplicadas, aplicando uma a uma sem apagar dados;
- rodo typecheck e build.

## Passo 3 — Relatório

Lista de PRs que entraram, o que precisou de ajuste manual e o que ficou pendente.

## Cuidados

- Não reescrever histórico já publicado.
- Preservar dados do banco e migrations existentes.
- O plano de reações com emoji continua pausado (só backend, sem interface) — não atrapalha.
