# Diagnosticar e corrigir repositório GitHub conectado

## Situação

O repositório local visível no sandbox é o repositório interno do Lovable (`git.private.lovable-gcp.code.storage`), não o GitHub. O GitHub sync é uma configuração da conta/workspace Lovable. Se o editor mostra `povo-que-batalha` em vez de `alisonmunhos/whatsapp-connect`, o projeto está conectado ao repositório errado — provavelmente porque a conta GitHub autorizada no GitHub App do Lovable é outra ou o repositório foi selecionado incorretamente.

## Passo 1 — Verificar a conta e o repositório conectado no editor Lovable

No editor do Lovable:
1. Menu **+** (canto inferior esquerdo do chat) → **GitHub** → **Configurações do GitHub** (ou "GitHub settings").
2. Confirmar qual conta GitHub aparece como conectada.
3. Confirmar qual repositório está vinculado ao projeto.

Possíveis cenários:
- A conta conectada é a errada → desconectar e reconectar com a conta correta.
- A conta é a certa, mas o repositório selecionado é `povo-que-batalha` → trocar para `alisonmunhos/whatsapp-connect`.

## Passo 2 — Desconectar o repositório errado (se necessário)

Se o repositório conectado for `povo-que-batalha` ou a conta for errada:
1. No mesmo menu GitHub, escolher **Desconectar** / **Disconnect**.
2. Se a conta estiver errada, também revogar o GitHub App do Lovable em: https://github.com/settings/applications (procure por "Lovable").

## Passo 3 — Reconectar ao repositório correto

1. No editor Lovable: menu **+ → GitHub → Connect project**.
2. Fazer login com a conta GitHub correta (`alisonmunhos`).
3. Selecionar a organização/conta `alisonmunhos`.
4. Selecionar o repositório `whatsapp-connect`.
5. Confirmar que a branch de sincronização é `main`.

## Passo 4 — Verificar sincronização e resolver conflitos

Após a reconexão:
1. Aguardar o Lovable sincronizar o histórico.
2. Verificar se os commits recentes do GitHub (`alisonmunhos/whatsapp-connect`) aparecem no editor/histórico do Lovable.
3. Se houver conflitos entre o código atual do Lovable e o do GitHub, resolver manualmente preservando dados e funcionalidades.
4. Rodar typecheck e build para garantir que tudo está íntegro.

## Cuidados

- Não reescrever o histórico já publicado.
- Preservar dados do banco e migrations existentes.
- Se o repositório `whatsapp-connect` estiver vazio ou com código antigo, avaliar se deve mesclar ou substituir.

## Próximo passo

Confirme no editor qual conta e repositório estão conectados atualmente. A partir daí eu oriento a desconexão/reconexão ou resolvo conflitos se for necessário.
