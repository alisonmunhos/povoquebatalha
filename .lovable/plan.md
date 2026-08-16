# Imagem de cabeçalho nos formulários públicos

Objetivo: permitir anexar uma imagem a cada formulário do construtor, exibida só na primeira tela (abaixo do título público) e usada como capa na pré-visualização do link no WhatsApp.

## 1. Banco (migration gerada, não aplicada)
- `form_definitions`: novas colunas `header_image_path text null` e `header_image_mime text null`.
- Sem alteração de RLS/grants; arquivos ficam no bucket privado já existente `campaign-media`.

## 2. Admin — upload (aba Entrada de Dados)
- Em `src/lib/form-definitions.functions.ts`:
  - Nova server function `signFormHeaderImageUpload` (staff/admin, espelhando `signMissionMediaUpload`): valida PNG/JPG/WEBP até 8 MB, gera signed upload URL em `formularios/header/${id}/${Date.now()}_${arquivo}`.
  - Nova server function para gerar link temporário de visualização da imagem já salva (preview no admin).
  - `updateSchema` de `updateFormDefinition`: aceita `header_image_path` e `header_image_mime` (texto opcional, podendo ser nulo).
- Em `src/routes/_authenticated/entrada-dados.$id.tsx`, seção "Configurações do formulário": campo de upload logo abaixo de "Título (público)", com miniatura, estado de envio e botão "Remover imagem" (limpa os dois campos). Os valores entram no payload de `saveFormulario` ("Salvar formulário").

## 3. Exibição na primeira tela
- `GET /api/public/forms/$slug` (`src/routes/api/public/forms/$slug.ts`): passa a selecionar `header_image_path` e devolver `header_image_url` (signed URL de 1h, igual ao `cover_url` de eventos). Sem imagem → `null`.
- `src/components/PublicFormRenderer.tsx`: renderiza a imagem em largura total logo abaixo do `<h1>`:
  - modo `sectioned`: apenas quando `sectionHistory.length === 0` (primeira tela), nos dois modos de apresentação (`inline` e `overlay`);
  - modo `flat`: sempre (é tela única);
  - nunca na tela de sucesso.
  - `alt` com o título do formulário; imagem com cantos arredondados e `loading="lazy"`.

## 4. Prévia do link no WhatsApp
- `src/lib/form-meta.functions.ts` (`getFormMeta`): seleciona também `header_image_path, header_image_mime, updated_at` e retorna `hasHeaderImage` + `imageVersion` (mesmo padrão de `getEventMeta`).
- Novo `src/routes/api/public/forms/$slug/og-image.ts`: baixa a imagem do storage e converte com `createOpenGraphJpeg` (letterbox 1200x630, preserva a imagem inteira — cartão vertical não é cortado). 404 quando o formulário está inativo ou sem imagem; cache público de 1h/24h como no de eventos.
- `src/routes/f.$slug.tsx`: o loader passa a buscar também a origem (`getRequestOrigin`) e, quando `hasHeaderImage`, o `head()` usa `og:image`/`twitter:image` = `${origin}/api/public/forms/${slug}/og-image?v=${imageVersion}` no lugar do padrão. Sem imagem, comportamento atual inalterado (`OG_DEFAULT_IMAGE` via `shareMeta`).

## Observações
- Campo totalmente opcional: formulários existentes continuam idênticos.
- Como o motor é único, os formulários fixos (`/recadastro`, `/atualizacao`, `/inscrever`) ganham o recurso automaticamente.
- Prévias já compartilhadas no WhatsApp ficam em cache do robô; o `?v=` força atualização em novos compartilhamentos, mas links antigos podem demorar a refletir a nova capa.
- A migration fica pronta para você aplicar manualmente; as colunas precisam existir antes de o upload funcionar.
