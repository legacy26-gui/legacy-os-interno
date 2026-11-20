import { AbasDaInteligencia } from "@/components/abas-da-inteligencia";

// As abas da Inteligência Comercial em cima da tela (ver abas-da-inteligencia.tsx).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AbasDaInteligencia />
      {children}
    </div>
  );
}
