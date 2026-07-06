import { createFileRoute } from "@tanstack/react-router";
import { UserSignupForm } from "@/components/UserSignupForm";

export const Route = createFileRoute("/cadastro-agitador")({
  head: () => ({
    meta: [
      { title: "Cadastro de agitador — Campanha do Povo que Batalha" },
      { name: "description", content: "Cadastre-se como agitador(a) voluntário(a) da Campanha do Povo que Batalha." },
    ],
  }),
  ssr: false,
  component: CadastroAgitador,
});

function CadastroAgitador() {
  return (
    <UserSignupForm
      endpoint="/api/public/forms/cadastro-agitador"
      title="Cadastro de agitador(a)"
      intro="Preencha seus dados para se cadastrar como agitador(a) voluntário(a). Um administrador aprovará seu acesso."
      waConfirmMessage="Olá Campanha do Povo que Batalha! Finalizei meu cadastro de agitador. Aguardo aprovação."
    />
  );
}
