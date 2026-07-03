## Corrigir botão "Minha localização" no navegador web

**Sintoma:** no desktop / navegador, o botão de GPS no mapa (`/territorio` → aba Mapa) não faz nada — o navegador nem chega a pedir autorização de localização.

**Causa provável:**
1. No preview do Lovable (iframe), a Geolocation API é bloqueada silenciosamente quando o iframe pai não tem `allow="geolocation"`. Nesse caso `getCurrentPosition` dispara `PERMISSION_DENIED` sem exibir o popup do navegador — usuário percebe como "não acontece nada" (o toast atual só diz "Permissão negada", sem explicar).
2. Se o usuário já negou uma vez no domínio, o navegador não pergunta de novo até ele reabilitar manualmente nas configurações do site.

O código atual já chama `navigator.geolocation.getCurrentPosition` diretamente dentro do handler de clique, então a "gesture chain" está correta — o problema é de permissão/contexto, não de código.

### Alterações em `src/components/TerritoryMapView.tsx` (função `handleLocate`)

1. **Detectar iframe** (`window.self !== window.top`) antes de chamar a API. Se estiver em iframe, mostrar toast com botão "Abrir em nova aba" apontando para a URL atual (`window.open(window.location.href, "_blank")`) — o preview do Lovable roda em iframe e não permite geolocalização.
2. **Consultar `navigator.permissions.query({ name: "geolocation" })`** (quando disponível) antes de disparar:
   - `granted` → segue direto.
   - `prompt` → segue direto (o navegador vai perguntar).
   - `denied` → mostra toast explicando como reabilitar (ícone de cadeado na barra de endereço → Permissões → Localização → Permitir) sem chamar a API.
3. **Mensagens de erro mais claras** no callback de erro do `getCurrentPosition`, diferenciando `PERMISSION_DENIED`, `POSITION_UNAVAILABLE` e `TIMEOUT`, com instrução prática em cada uma.
4. **Aumentar `timeout`** de 10s para 15s e permitir `maximumAge` maior (30s) para reduzir falha em desktops sem GPS que dependem de Wi-Fi.

Sem mudanças no fluxo assíncrono principal nem em backend — apenas guardas e mensagens no handler do botão.
