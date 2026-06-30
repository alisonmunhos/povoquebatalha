# Reformulação do Módulo de Importação + Páginas Públicas

> ⚠️ Não localizei nenhuma planilha anexada nesta mensagem (a pasta de uploads está vazia). Vou implementar com base nos requisitos descritos. Quando você anexar a planilha de novo, eu valido com ela em mãos.

> 🔧 Também há um erro de runtime ativo em `/contatos` (`Invariant failed: Expected to find a match below the root match in SPA mode`). Vou corrigir junto, pois envolve o mesmo conjunto de rotas.

---

## 1. Encoding PT-BR (acentos e cedilha)

**Problema:** hoje o parser lê o arquivo via `arrayBuffer` direto no `XLSX.read`. Para CSV salvo em ISO-8859-1 / Windows-1252 (padrão Excel BR), os acentos viram `Ã§`, `Ã£`, etc.

**Mudanças:**
- Detectar tipo do arquivo pela extensão (`.csv` vs `.xlsx/.xls`).
- Para XLSX: continuar via `XLSX.read(buffer, { type: 'array' })` — preserva Unicode nativamente.
- Para CSV: detectar encoding em ordem:
  1. BOM UTF-8 (`EF BB BF`) → UTF-8.
  2. Tentar decodificar como UTF-8 com `fatal: true`; se falhar ou aparecerem substitutos (`�`, `Ã`+letra acentuada típica), tratar como Windows-1252.
  3. Permitir override manual via dropdown na tela de upload (`auto`, `utf-8`, `utf-8-bom`, `iso-8859-1`, `windows-1252`).
- Decodificar com `TextDecoder(encoding)` antes de passar para `XLSX.read(text, { type: 'string', raw: false })`.
- Tela de prévia mostra as 5 primeiras linhas decodificadas. Se o usuário ver `Ã§`, ele troca o encoding e a prévia recarrega sem precisar reenviar o arquivo (re-decodifica a partir do binário já no Storage).

**Campo novo no contato:**
- `nome` permanece exibido com acentos.
- `nome_normalizado` (gerado por trigger): `unaccent(lower(trim(nome)))` para busca/dedup.

---

## 2. Normalização de telefone (camada robusta)

Substituir a função SQL atual por uma camada que devolve todos os campos técnicos pedidos.

**Novos campos em `contacts`:**
- `phone_raw` (original — já existe, renomear conceitualmente como `telefone_original`)
- `phone_digits` (só dígitos)
- `phone_ddi` (default `55`)
- `phone_ddd` (2 dígitos quando identificável)
- `phone_e164` (já existe)
- `phone_last8`, `phone_last9`
- `phone_whatsapp_candidate` (versão sugerida com 9º dígito quando aplicável)
- `phone_status` enum: `valido | precisa_revisao | invalido | sem_ddd | sem_nono_digito | duplicado_possivel`

**Regras (função `private.parse_phone_br(input, default_ddd)`):**
1. Extrai dígitos; remove zeros à esquerda.
2. Se começa com `55` e tem 12-13 dígitos → assume DDI.
3. Se 10-11 dígitos → adiciona `55`.
4. Se 8-9 dígitos → tenta `default_ddd` (parâmetro da importação); senão → `sem_ddd / precisa_revisao`.
5. Detecta celular antigo (DDD + 8 dígitos começando com 6-9) → gera `whatsapp_candidate` com `9` inserido após DDD, status `sem_nono_digito`.
6. Não sobrescreve `phone_raw`.
7. Retorna struct (jsonb) com todos os campos.

**Tela de importação:**
- Campo "DDD padrão (opcional)" no passo de mapeamento.
- Prévia já mostra `telefone_original → telefone_e164` + badge de status colorido.

---

## 3. Deduplicação inteligente

No commit da importação, para cada linha:
1. Match **forte**: `phone_e164` igual OU `email` igual (case-insensitive).
2. Match **provável**: `phone_last8` igual + `similarity(nome_normalizado) > 0.6`.
3. Match **possível**: `phone_last8` igual OU `similarity(nome_normalizado) > 0.8`.

**Comportamento:**
- Forte → atualiza contato existente (merge não-destrutivo: só preenche campos vazios).
- Provável/Possível → **não mescla**. Cria contato novo com `phone_status = duplicado_possivel` e registra par em nova tabela `contact_duplicates(contact_a, contact_b, score, tipo, status='pendente')`.
- Nova rota admin `/duplicidades` lista pares pendentes com botões "Mesclar", "Manter separados", "Ignorar".

---

## 4. Status de requalificação

Novo enum `contact_lifecycle_status`:
`importado_aguardando_recadastro | link_enviado | recadastro_iniciado | recadastro_concluido | nao_respondeu | telefone_invalido | precisa_revisao | duplicado_possivel | duplicado_mesclado | nao_enviar`

- Coluna `lifecycle_status` em `contacts`, default conforme origem:
  - `origem='import'` → `importado_aguardando_recadastro`
  - `origem='recadastro'` → `recadastro_concluido`
  - `origem='inscricao'` → `recadastro_concluido` (lista de divulgação)
- Transições atualizadas pelos fluxos de campanha e webhook (próxima etapa, mas o campo já fica preparado).

---

## 5. Páginas públicas independentes do admin

**Status atual:** `/recadastro`, `/inscrever`, `/obrigado`, `/opt-out/:token` já existem fora do `_authenticated`. Vou:
- Garantir que o `_authenticated/route.tsx` **não** intercepte essas rotas (já não intercepta, mas vou confirmar e adicionar teste manual).
- Adicionar `ssr: false` consistentemente e remover qualquer redirect que mande logado para `/dashboard` ao acessar essas rotas.
- Remover qualquer chrome admin (sidebar/header) das páginas públicas — hoje já estão limpas, vou revisar visualmente.
- Suportar `?origem=...` e salvar em `contacts.origem_detalhe` (novo campo texto livre, máx 80 chars, validado contra lista permitida + free-form).
- Suportar `?t=TOKEN` no `/recadastro` para pré-associar contato importado.

**Token individual de recadastro:**
- Nova coluna `contacts.recad_token` (UUID v4, único, gerado on-demand).
- Endpoint `POST /api/public/forms/recadastro` aceita `t`; resolve contato; merge não-destrutivo; se telefone novo difere do antigo → registra em `contact_duplicates` e marca como `precisa_revisao`.
- Token **não** expõe ID/telefone/email — só UUID opaco.

---

## 6. Tela "Links Públicos" no admin

Nova rota `/_authenticated/links`:
- Cards para cada link: Recadastro, Inscrição, Opt-out (genérico não — apenas com token).
- Campo "Origem" (select com presets: `whatsapp_grupo_antigo`, `site_campanha`, `instagram`, `evento_presencial`, `qr_code_impresso`, `lista_alicerce` + free-form).
- Geração ao vivo do link: `https://<host>/recadastro?origem=whatsapp_grupo_antigo`.
- Botões: **Copiar**, **Abrir em nova aba**, **Copiar link com origem**, **Gerar QR Code** (PNG via `qrcode` lib).
- Seção "Links individuais": lista contatos importados com botão "Gerar/copiar link com token".

---

## 7. Prévia visual da importação (commit guardado)

Hoje a prévia mostra só 5 linhas de amostra crua. Vou adicionar um passo **"Revisar antes de importar"** entre o mapeamento e o commit:

Tabela paginada (até 200 linhas por vez) com colunas:
- Linha da planilha
- Nome
- Telefone original
- Telefone normalizado (`e164`)
- Status do telefone (badge)
- Possível duplicidade (com link para o contato existente)
- Observações
- Tags sugeridas (placeholder por enquanto, fica pronto para Etapa 2)

Ações na prévia:
- **Confirmar importação** (todos válidos + revisão)
- **Importar apenas linhas válidas** (descarta `invalido`/`precisa_revisao`)
- **Marcar problemáticas como "precisa revisão"** (importa tudo, mas com status)
- **Cancelar**
- **Baixar relatório CSV** (linhas + erros)

Implementação: o `parseUpload` agora também executa o `parse_phone_br` e a busca de dedup em batch e salva o resultado em `import_rows.preview` (jsonb). O `commitImport` apenas materializa essa decisão.

---

## 8. Bug de runtime em `/contatos`

`Invariant failed: Expected to find a match below the root match in SPA mode` — provavelmente `<Outlet />` faltando ou rota órfã após mudanças anteriores. Vou abrir `_authenticated/route.tsx` e `contatos.tsx` e corrigir.

---

## Detalhes técnicos (migrations + arquivos)

**Migration 1 — schema:**
- Extensão `unaccent` (já existe).
- `ALTER TABLE contacts ADD COLUMN nome_normalizado, phone_digits, phone_ddi, phone_ddd, phone_last9, phone_whatsapp_candidate, phone_status, lifecycle_status, origem_detalhe, recad_token`.
- Enum `contact_phone_status` e `contact_lifecycle_status`.
- Função `private.parse_phone_br(input text, default_ddd text default null) returns jsonb`.
- Função/trigger `contacts_phone_fill` reescrita para popular todos os campos.
- Trigger `contacts_nome_norm_fill` (`unaccent(lower(trim(nome)))`).
- Tabela `contact_duplicates` + grants + RLS.
- Index `contacts(phone_last8)`, `contacts(nome_normalizado gin_trgm_ops)` (já há trigram).

**Arquivos a alterar/criar:**
- `src/lib/imports.functions.ts` — encoding detection, preview pipeline, decisão de commit.
- `src/lib/phone.ts` — wrapper TS para uso em forms.
- `src/routes/_authenticated/importar.tsx` — adicionar steps: Upload (+encoding) → Mapeamento (+DDD padrão) → Revisar → Resultado.
- `src/routes/_authenticated/links.tsx` (novo) — tela Links Públicos.
- `src/routes/_authenticated/duplicidades.tsx` (novo) — revisão de duplicatas.
- `src/routes/api/public/forms/recadastro.ts` — aceitar `t` + merge não-destrutivo + dedup.
- `src/routes/api/public/forms/inscrever.ts` — salvar `origem_detalhe`, marcar `lifecycle_status='recadastro_concluido'`, `tipo='lista_divulgacao'`.
- `src/routes/recadastro.tsx` / `inscrever.tsx` — ler `?origem` e `?t` da query; pré-popular nome/telefone quando vier por token.
- `src/components/AppShell.tsx` — adicionar item "Links Públicos" e "Duplicidades" na sidebar.
- Bug: arquivo de rota relevante para `/contatos`.

**Dependências novas:** `qrcode` (geração de QR Code em PNG base64), nada mais.

---

## Ordem de execução

1. Migration (schema + funções + duplicates table).
2. Refatorar `imports.functions.ts` (encoding + telefone + dedup + preview).
3. Refatorar `importar.tsx` (passo de revisão).
4. Ajustar páginas públicas (`recadastro`, `inscrever`) + endpoints (`?origem`, `?t`).
5. Criar `/_authenticated/links` e `/_authenticated/duplicidades`.
6. Corrigir invariante de `/contatos`.
7. Testar com CSV em Windows-1252 (vou gerar um arquivo de teste no `/tmp` e simular).

Posso seguir com a implementação?
