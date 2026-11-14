// Servidor MCP da Campanha do Povo que Batalha.
//
// Todas as ferramentas exigem token OAuth do emissor do app e consultam o banco
// como o próprio chamador, então a RLS decide linha por linha o que ele pode ver.
import { auth, defineMcp } from "@lovable.dev/mcp-js";

import buscarContatoTool from "./tools/buscar-contato";
import detalhesCampanhaTool from "./tools/detalhes-campanha";
import estatisticasStoryTool from "./tools/estatisticas-story";
import listarCampanhasTool from "./tools/listar-campanhas";
import listarContatosTool from "./tools/listar-contatos";
import listarMensagensTool from "./tools/listar-mensagens";
import listarTemplatesTool from "./tools/listar-templates";
import resumoGeralTool from "./tools/resumo-geral";

// O ref é embutido na compilação e é estável; a URL publicada pode ser um proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "whatsapp-connect",
  title: "WhatsApp Connect",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura da Campanha do Povo que Batalha: resumo geral, contatos, campanhas de mensagem, mensagens recebidas, modelos de texto e o uso anônimo da página /story. Toda consulta é feita como o usuário autenticado, respeitando as permissões e as regras de acesso do app. Nenhuma ferramenta altera dados.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
    requireOAuthClientClaim: true,
  }),
  tools: [
    resumoGeralTool,
    listarContatosTool,
    buscarContatoTool,
    listarCampanhasTool,
    detalhesCampanhaTool,
    listarMensagensTool,
    listarTemplatesTool,
    estatisticasStoryTool,
  ],
});
