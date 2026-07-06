## Diagnóstico

No app publicado, ao clicar em **Mostrar QR Code** nada aparece na tela. Causa técnica:

- Em `src/routes/_authenticated/whatsapp.tsx` o QR é buscado com `useSuspenseQuery` e um `queryKey` que muda conforme `showQr` (`["zapi-qr", showQr]`).
- Quando `showQr` vira `true`, o query key muda e o `useSuspenseQuery` **suspende o componente inteiro**. Como não existe um `<Suspense>` local ao redor do card do QR, o suspend sobe até o boundary do router — no build de produção isso resulta em tela em branco / "nada acontece" (no preview em dev o comportamento é mais permissivo, por isso funciona lá).
- Também confirmei via logs do worker publicado que a rota do server function do QR chega a ser chamada, mas o clique nem chega a renderizar o painel para o usuário porque o componente suspendeu antes.

## Plano de ação (mínimo e focado)

Alterar **apenas** `src/routes/_authenticated/whatsapp.tsx`:

1. Trocar o `useSuspenseQuery` do QR por `useQuery` com `enabled: showQr` e sem `queryFn` condicional. Assim:
   - Enquanto `showQr` for `false`, a query fica desabilitada (não roda, não suspende).
   - Ao clicar, roda em background sem congelar a página.
2. Ajustar a renderização do card `{showQr && (...)}` para os três estados vindos de `useQuery`:
   - `qr.isLoading` → "Carregando…"
   - `qr.data?.ok && qr.data.image` → `<img>` do QR
   - `qr.isError` ou `qr.data?.ok === false` → mensagem em português com o erro (usar `qr.error?.message` ou `qr.data.error`) e um botão "Tentar novamente" que chama `qr.refetch()`.
3. Manter o `refetchInterval: 6000` só quando `showQr` estiver ligado (Z-API renova o QR a cada poucos segundos).
4. Não mexer em `getZapiQr` no servidor, nem no cliente Z-API, nem em envs — o problema é 100% de renderização no cliente.

## Observações

- Nada de mudanças de banco, envs, políticas ou automações.
- Após publicar (botão "Update" no dialog de Publish), a correção passa a valer no `.lovable.app`. Alterações de frontend só chegam ao publicado depois desse clique.
- Se depois de publicar o QR ainda vier com erro, o texto exato aparecerá no card (hoje ficava escondido pelo suspend) e a partir dele conseguimos agir com precisão.
