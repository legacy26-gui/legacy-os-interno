import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Cadastro de cliente — Legacy Digital",
  description: "Formulário de entrada para novos clientes da Legacy Digital.",
  // Página de link direto: não deve aparecer em busca do Google.
  robots: { index: false, follow: false },
};

// Página pública: quem abre é o cliente, sem login. A liberação está em
// src/proxy.ts (PUBLIC_ROUTES).
export default function FormularioPage() {
  return (
    <div className="min-h-dvh bg-background px-4 py-8 sm:py-12 pt-[calc(2rem+env(safe-area-inset-top,0px))] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
        <header className="text-center">
          <span className="text-xl font-black tracking-tight">
            LEGACY<span className="text-accent">OS</span>
          </span>
          <p className="text-[10px] text-foreground-muted tracking-[0.25em] mt-0.5">LEGACY DIGITAL</p>
          <h1 className="text-xl sm:text-2xl font-semibold mt-6">Vamos começar sua operação</h1>
          <p className="text-sm text-foreground-muted mt-2 max-w-lg mx-auto">
            Responda as perguntas abaixo pra nossa equipe montar suas campanhas do jeito certo desde o primeiro dia.
          </p>
        </header>

        <OnboardingForm />
      </div>
    </div>
  );
}
