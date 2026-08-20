import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Cadastro de cliente — Legacy Digital",
  description: "Formulário de entrada para novos clientes da Legacy Digital.",
  // Página de link direto: não deve aparecer em busca do Google.
  robots: { index: false, follow: false },
};

// Página pública: quem abre é o cliente, sem login. A liberação está em
// src/proxy.ts (OPEN_ROUTES). O visual é preto e amarelo, fixo — não segue o
// tema claro/escuro do sistema interno.
export default function FormularioPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      {/* Brilho amarelo suave no topo, pra tela não ficar chapada */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(255,198,41,0.16),transparent_70%)]"
        />

        <div className="relative px-4 py-10 sm:py-14 pt-[calc(2.5rem+env(safe-area-inset-top,0px))] pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="w-full max-w-3xl mx-auto flex flex-col gap-8">
            <header className="text-center">
              <span className="text-2xl font-black tracking-tight text-white">
                LEGACY<span className="text-[#FFC629]">OS</span>
              </span>
              <p className="text-[10px] text-zinc-500 tracking-[0.3em] mt-1">LEGACY DIGITAL</p>

              <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#FFC629]/30 bg-[#FFC629]/10 px-4 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFC629]" />
                <span className="text-xs font-medium text-[#FFC629] tracking-wide">DIAGNÓSTICO DA OPERAÇÃO</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-bold mt-5 tracking-tight leading-tight">
                Vamos entender sua loja
                <br className="hidden sm:block" /> antes de vender por ela
              </h1>
              <p className="text-sm sm:text-base text-zinc-400 mt-4 max-w-xl mx-auto leading-relaxed">
                Quanto mais preciso você for aqui, mais afiada sai a estratégia que vamos levar pra sua reunião.
              </p>
            </header>

            <OnboardingForm />

            <footer className="text-center text-xs text-zinc-600 pt-2">
              Legacy Digital · suas respostas ficam só com a nossa equipe
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
