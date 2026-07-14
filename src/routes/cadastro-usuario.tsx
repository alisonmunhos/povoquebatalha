import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { UserSignupForm } from "@/components/UserSignupForm";
import { PUBLIC_SIGNUP_ROLES, ROLE_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/cadastro-usuario")({
  validateSearch: z.object({ role: z.enum(PUBLIC_SIGNUP_ROLES).optional() }),
  head: () => ({
    meta: [
      { title: "Cadastro de usuário — Campanha do Povo que Batalha" },
      { name: "description", content: "Cadastre-se para acessar o painel da Campanha do Povo que Batalha." },
      { name: "google", content: "notranslate" },
    ],
  }),
  ssr: false,
  component: CadastroUsuario,
});

function CadastroUsuario() {
  const { role } = Route.useSearch();
  const roleLabel = role ? ROLE_LABEL[role] : null;
  return (
    <UserSignupForm
      endpoint="/api/public/forms/cadastro-usuario"
      title="Cadastro de novo usuário"
      intro={
        roleLabel
          ? `Preencha seus dados para se cadastrar como ${roleLabel}. Um administrador aprovará seu acesso.`
          : "Preencha seus dados para se cadastrar. Um administrador aprovará seu acesso e define seu papel no painel."
      }
      waConfirmMessage={
        roleLabel
          ? `Olá Campanha do Povo que Batalha! Finalizei meu cadastro (${roleLabel}). Aguardo aprovação.`
          : "Olá Campanha do Povo que Batalha! Finalizei meu cadastro. Aguardo aprovação."
      }
      extraBody={role ? { role } : undefined}
    />
  );
}
