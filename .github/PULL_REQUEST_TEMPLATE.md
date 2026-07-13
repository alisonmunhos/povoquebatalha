---
name: "feat(contacts-sheet): tags chips, disponibilidade markers, copy-formatted bulk action"
about: "UI improvements for contacts sheet: tag chips, disponibilidade markers and copy formatted bulk action"
labels:
  - feature
---

This PR implements UI improvements and a small mapping bug fix for the Contacts Sheet (contatos-bi):

- Render tag chips with color in the grid (uses tag objects returned by `listContactsSheet`).
- Render compact week markers for `disponibilidade` with a tooltip listing day + shift.
- Add a bulk action button **Copiar lista formatada** that copies `Nome — Telefone` lines for selected contacts (copies only loaded rows and warns if some selected IDs were not loaded).
- Fix `column-filter-mapping.ts` to use catalog options for `disponibilidade` and `formas_ajuda` when present (avoids empty popover).

Files changed:
- src/lib/column-filter-mapping.ts
- src/components/contacts-sheet/Cell.tsx
- src/components/contacts-sheet/BulkActionBar.tsx
- src/routes/_authenticated/contatos-bi.tsx

Testing instructions (manual):
1. Open `/contatos-bi`.
2. Enable the `tags` column and verify colored chips appear for rows with tags.
3. Enable `disponibilidade` column and verify the 7-day markers and tooltip with shifts.
4. Select some rows and click "Copiar lista formatada" — check the clipboard contents and toast.
5. Open column filters for `disponibilidade` and `formas_ajuda` — options should appear using catalog values.

Notes:
- The copy action copies only contacts currently loaded in the grid; if the selection includes IDs outside the page, the PR warns with a toast about missing items. If you want the action to fetch missing contacts by ID and include them, I can extend the PR.
