"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useRef } from "react";
import { Upload, Sparkles, X } from "lucide-react";
import { criarArte } from "@/lib/actions/studio";

// O formulário de uma arte nova.
//
// ── A ordem dos campos é a ordem do trabalho ─────────────────────────────
//
// Loja, foto, modelo, preço. É a sequência em que a informação chega: o
// vendedor manda a foto no WhatsApp com "chegou um Onix 2020, 89 mil". Pedir
// o preço antes da foto faria a pessoa trocar de tela no meio.
//
// ── Por que a foto é a primeira coisa visível ────────────────────────────
//
// Porque é a única que pode dar errado de um jeito que só se descobre
// olhando: foto deitada, foto escura, foto do carro errado. Mostrar a
// prévia na hora do anexo custa nada e evita a peça sair errada.

export interface LojaDaArte {
  id: string;
  nome: string;
  temMarca: boolean;
}

export function FormularioDaArte({ lojas }: { lojas: LojaDaArte[] }) {
  const router = useRouter();
  const [pendente, comecar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [lojaId, setLojaId] = useState(lojas[0]?.id ?? "");
  const campoDaFoto = useRef<HTMLInputElement>(null);

  const loja = lojas.find((l) => l.id === lojaId);

  function enviar(formData: FormData) {
    setErro(null);
    comecar(async () => {
      const r = await criarArte(
        {
          clientId: (formData.get("clientId") as string) ?? "",
          marca: (formData.get("marca") as string) ?? "",
          modelo: (formData.get("modelo") as string) ?? "",
          versao: (formData.get("versao") as string) ?? "",
          ano: (formData.get("ano") as string) ?? "",
          kmTexto: (formData.get("km") as string) ?? "",
          preco: (formData.get("preco") as string) ?? "",
          precoDe: (formData.get("precoDe") as string) ?? "",
          detalhes: (formData.get("detalhes") as string) ?? "",
          chamada: (formData.get("chamada") as string) ?? "",
        },
        formData
      );
      if (r?.erro) {
        setErro(r.erro);
        return;
      }
      // Vai direto pra peça: o passo seguinte é olhar se ficou boa, não
      // voltar pra uma lista e procurá-la.
      if (r?.id) router.push(`/studio/${r.id}`);
    });
  }

  function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setPrevia(null);
      return;
    }
    // Prévia local, sem subir nada: é só pra pessoa ver que anexou a foto
    // certa. O servidor recebe o arquivo de novo no envio.
    const leitor = new FileReader();
    leitor.onload = () => setPrevia(typeof leitor.result === "string" ? leitor.result : null);
    leitor.readAsDataURL(f);
  }

  if (lojas.length === 0) {
    return (
      <p className="text-sm text-foreground-muted rounded-xl border border-border bg-surface p-8 text-center">
        Você ainda não tem loja na carteira.
      </p>
    );
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Loja
          </span>
          <select
            name="clientId"
            value={lojaId}
            onChange={(e) => setLojaId(e.target.value)}
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          >
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
                {l.temMarca ? "" : "  (sem identidade cadastrada)"}
              </option>
            ))}
          </select>
          {/* O aviso de loja sem identidade, com o caminho pra resolver.
              Antes era só uma frase, e uma frase não impede ninguém de
              seguir em frente: a primeira arte de verdade saiu sem logo e
              com as cores padrão, e o Guilherme resumiu em três palavras —
              "sem a identidade". O aviso agora leva pra tela que conserta,
              porque avisar sem oferecer o conserto é só reclamar. */}
          {loja && !loja.temMarca && (
            <span className="text-xs rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
              <strong>{loja.nome} ainda não tem identidade cadastrada.</strong> Sem logo e sem as
              cores da loja, a arte sai com a cara neutra do sistema — e não parece dela.{" "}
              <Link href="/studio/marcas" className="underline font-medium">
                Cadastrar agora
              </Link>{" "}
              leva um minuto, e vale mais que gerar dez artes sem marca.
            </span>
          )}
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Foto do veículo
          </span>

          {/* O campo de arquivo fica montado SEMPRE, fora do condicional.
              Isto já foi um defeito: a prévia era renderizada no lugar da
              área de anexo, o React desmontava o <input> e o arquivo
              escolhido sumia junto — o formulário chegava no servidor sem
              foto nenhuma, dizendo "anexe a foto do veículo" pra quem tinha
              acabado de anexar.

              Campo de arquivo guarda o arquivo DENTRO do elemento. Tirar o
              elemento da tela é tirar o arquivo do formulário. Então ele
              nasce uma vez, escondido, e o que troca em volta é só o que se
              vê. */}
          <input
            ref={campoDaFoto}
            id="foto-do-veiculo"
            type="file"
            name="foto"
            accept="image/*"
            onChange={aoEscolherFoto}
            className="hidden"
          />

          {previa ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previa}
                alt="Prévia da foto escolhida"
                className="w-full max-h-72 object-contain rounded-lg bg-black"
              />
              <button
                type="button"
                onClick={() => {
                  setPrevia(null);
                  if (campoDaFoto.current) campoDaFoto.current.value = "";
                }}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-11 h-11 rounded-lg bg-black/70 text-white hover:bg-black"
                aria-label="Tirar esta foto"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <label
              htmlFor="foto-do-veiculo"
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background px-4 py-10 cursor-pointer hover:border-border-forte"
            >
              <Upload size={22} className="text-foreground-muted" />
              <span className="text-sm text-foreground-muted">
                Toque pra escolher a foto do carro
              </span>
              <span className="text-xs text-foreground-muted">JPG ou PNG, até 12MB</span>
            </label>
          )}
        </div>

        {/* Marca e modelo em campos separados porque na arte eles vão em
            linhas diferentes, com pesos diferentes — "CHEVROLET" pequeno em
            cima, "CRUZE" enorme embaixo. Num campo só não dá pra saber onde
            quebrar. */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Marca
            </span>
            <input
              name="marca"
              maxLength={30}
              autoComplete="off"
              placeholder="Chevrolet"
              className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Modelo
            </span>
            <input
              name="modelo"
              required
              maxLength={80}
              autoComplete="off"
              placeholder="Cruze"
              className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Versão <span className="normal-case tracking-normal">(opcional)</span>
          </span>
          <input
            name="versao"
            maxLength={40}
            autoComplete="off"
            placeholder="LTZ2 Sport6"
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Ano
            </span>
            <input
              name="ano"
              autoComplete="off"
              placeholder="2020/2021"
              className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Quilometragem
            </span>
            <input
              name="km"
              autoComplete="off"
              inputMode="numeric"
              placeholder="45000"
              className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              Preço
            </span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                R$
              </span>
              <input
                name="preco"
                inputMode="decimal"
                autoComplete="off"
                placeholder="89.900"
                className="w-full pl-9 pr-3 min-h-11 rounded-lg border border-border bg-background text-sm tabular-nums"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
              De <span className="normal-case tracking-normal">(riscado)</span>
            </span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                R$
              </span>
              <input
                name="precoDe"
                inputMode="decimal"
                autoComplete="off"
                placeholder="—"
                className="w-full pl-9 pr-3 min-h-11 rounded-lg border border-border bg-background text-sm tabular-nums"
              />
            </div>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Ficha
          </span>
          <input
            name="detalhes"
            maxLength={160}
            autoComplete="off"
            placeholder="1.4 Turbo | Automático | Completo | Teto solar"
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          />
          <span className="text-xs text-foreground-muted">
            Separe com <strong>|</strong>. Viram os blocos com ícone na faixa. Cabem quatro ao
            todo, contando a quilometragem e o ano.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-foreground-muted font-medium">
            Chamada <span className="normal-case tracking-normal">(opcional)</span>
          </span>
          <input
            name="chamada"
            maxLength={40}
            autoComplete="off"
            placeholder="Entrada + 48x"
            className="px-3 min-h-11 rounded-lg border border-border bg-background text-sm"
          />
          <span className="text-xs text-foreground-muted">
            Aparece em destaque, na cor da loja. Curto funciona melhor.
          </span>
        </label>
      </div>

      {erro && <p className="text-sm text-red-500">{erro}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="self-start inline-flex items-center gap-2 px-5 min-h-11 bg-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60"
      >
        <Sparkles size={15} className={pendente ? "animate-pulse" : undefined} />
        {pendente ? "Gerando…" : "Gerar arte"}
      </button>
    </form>
  );
}
