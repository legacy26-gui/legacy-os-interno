/**
 * Recebe o lead da landing legacyautomotivo.com.br e grava no Legacy OS.
 *
 * A URL final fica:
 *   https://legacy-os-interno.vercel.app/api/publico/leads
 *
 * ARQUIVO NOVO. Não é cópia nem adaptação de nenhuma rota existente do
 * Legacy OS. Em especial, NÃO tem relação com `api/diagnostico/gerar` — aquela
 * gera análise de ficha com IA; esta só recebe o formulário do site e grava um
 * lead. O nome "diagnóstico" é comercial, da landing, e por isso foi tirado do
 * caminho: evita exatamente essa confusão.
 *
 * SEGURANÇA — esta rota é pública de propósito, mas não é desprotegida:
 *   - só aceita POST; não existe GET, então ela não lista nada;
 *   - só aceita requisição vinda de legacyautomotivo.com.br (Origin + CORS);
 *   - limite de envios por IP;
 *   - valida todos os campos e ignora qualquer coisa fora do esperado;
 *   - não chama IA, não consome crédito de OpenAI, não lê dado de cliente.
 *
 * Ela NÃO usa `SETUP_SECRET` nem chave nenhuma: a landing é pública e qualquer
 * chave colocada nela ficaria visível no navegador do visitante.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/* ------------------------------------------------------------------ *
 * CORS — sem isso o navegador bloqueia antes de chegar aqui
 * ------------------------------------------------------------------ */

const ORIGENS_LIBERADAS = new Set([
  'https://legacyautomotivo.com.br',
  'https://www.legacyautomotivo.com.br',
]);

function cabecalhosCors(origem: string | null) {
  const liberada = origem && ORIGENS_LIBERADAS.has(origem);
  return {
    // Só devolve a origem quando ela está na lista. Nunca usar '*':
    // com '*' qualquer site do mundo joga lead falso na base.
    'Access-Control-Allow-Origin': liberada ? origem! : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cabecalhosCors(req.headers.get('origin')) });
}

/* ------------------------------------------------------------------ *
 * Limite de envio por IP
 * Fica no Postgres, não na memória: na Vercel cada requisição pode cair numa
 * instância diferente, e elas reiniciam a cada deploy — contador em memória
 * não segura nada de verdade. Volume de landing de agência não justifica Redis.
 * ------------------------------------------------------------------ */

const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_JANELA = 5;
const VALIDADE_DA_TENTATIVA_MS = 24 * 60 * 60 * 1000;

async function passouDoLimite(ip: string) {
  try {
    await prisma.tentativaLead.create({ data: { ip } });

    // Conta inclusive o envio de agora: o sexto dentro da janela é barrado.
    const total = await prisma.tentativaLead.count({
      where: { ip, createdAt: { gte: new Date(Date.now() - JANELA_MS) } },
    });

    // Faxina oportunista — sem isso a tabela cresce pra sempre sem servir pra
    // nada. Uma vez a cada vinte envios é suficiente e não pesa na resposta.
    if (Math.random() < 0.05) {
      await prisma.tentativaLead
        .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - VALIDADE_DA_TENTATIVA_MS) } } })
        .catch(() => {});
    }

    return total > MAX_POR_JANELA;
  } catch (e) {
    // Banco fora do ar não pode virar porta fechada: perder lead de verdade é
    // pior que deixar passar envio repetido. Segue, e a gravação decide.
    console.error('[lead-publico] não consegui conferir o limite por IP', e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Validação — de novo, do lado do servidor
 * A validação da landing é para a experiência do usuário. Qualquer um
 * manda POST direto aqui sem passar pela página.
 * ------------------------------------------------------------------ */

const ESTOQUE = ['Até 20', '21–40', '41–70', '71–100', '+100'];
const VENDAS = ['Até 10', '11–20', '21–40', '41–70', '+70'];
const VERBA = ['Até R$ 2.000', 'R$ 2.000–5.000', 'R$ 5.000–10.000', '+R$ 10.000'];
const INVESTIMENTO = ['Até R$ 1.500', 'R$ 1.500–3.000', 'R$ 3.000–5.000', 'R$ 5.000+'];
const DESAFIOS = [
  'Gerar mais oportunidades', 'Melhorar atendimento', 'Melhorar follow-up',
  'Aumentar conversão', 'Girar estoque', 'Estruturar o comercial', 'Outro',
];
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// As faixas usam travessão (–), não hífen. Copiar e colar, não redigitar.

type Resultado = { ok: true; dados: LeadLimpo } | { ok: false; erro: string };

type LeadLimpo = {
  nome: string; whatsapp: string; whatsappDigitos: string;
  loja: string; cidade: string; estado: string;
  estoque: string; vendas: string; trafego: string;
  verba: string | null; desafio: string; investimento: string | null;
  utmSource: string; utmMedium: string; utmCampaign: string;
  utmContent: string; utmTerm: string; utmId: string; src: string;
  pagina: string; referencia: string; enviadoEm: Date;
};

function texto(v: unknown, max = 120) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function valida(corpo: Record<string, unknown> | null): Resultado {
  const nome = texto(corpo?.nome, 120);
  const loja = texto(corpo?.loja, 120);
  const cidade = texto(corpo?.cidade, 80);
  const estado = texto(corpo?.estado, 2).toUpperCase();
  const whatsapp = texto(corpo?.whatsapp, 20);
  const digitos = whatsapp.replace(/\D/g, '');

  if (nome.length < 2) return { ok: false, erro: 'nome' };
  if (loja.length < 2) return { ok: false, erro: 'loja' };
  if (cidade.length < 2) return { ok: false, erro: 'cidade' };
  if (!UFS.includes(estado)) return { ok: false, erro: 'estado' };

  // 10 ou 11 dígitos, DDD entre 11 e 99.
  const ddd = Number(digitos.slice(0, 2));
  if (digitos.length < 10 || digitos.length > 11 || ddd < 11 || ddd > 99) {
    return { ok: false, erro: 'whatsapp' };
  }

  const estoque = texto(corpo?.estoque, 20);
  const vendas = texto(corpo?.vendas, 20);
  const trafego = texto(corpo?.trafego, 10);
  const desafio = texto(corpo?.desafio, 60);

  if (!ESTOQUE.includes(estoque)) return { ok: false, erro: 'estoque' };
  if (!VENDAS.includes(vendas)) return { ok: false, erro: 'vendas' };
  if (trafego !== 'Sim' && trafego !== 'Não') return { ok: false, erro: 'trafego' };
  if (!DESAFIOS.includes(desafio)) return { ok: false, erro: 'desafio' };

  // verba só existe quando trafego === 'Sim'; investimento é desligável na landing
  const verbaBruta = texto(corpo?.verba, 30);
  const verba = trafego === 'Sim' && VERBA.includes(verbaBruta) ? verbaBruta : null;
  const invBruto = texto(corpo?.investimento, 30);
  const investimento = INVESTIMENTO.includes(invBruto) ? invBruto : null;

  return {
    ok: true,
    dados: {
      nome, whatsapp, whatsappDigitos: digitos, loja, cidade, estado,
      estoque, vendas, trafego, verba, desafio, investimento,
      utmSource: texto(corpo?.utm_source, 180),
      utmMedium: texto(corpo?.utm_medium, 180),
      utmCampaign: texto(corpo?.utm_campaign, 180),
      utmContent: texto(corpo?.utm_content, 180),
      utmTerm: texto(corpo?.utm_term, 180),
      utmId: texto(corpo?.utm_id, 180),
      src: texto(corpo?.src, 180),
      pagina: texto(corpo?.pagina, 400),
      referencia: texto(corpo?.referencia, 400),
      enviadoEm: new Date(),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Canal do lead
 *
 * A landing não tem um canal fixo: ela recebe anúncio, link da bio, WhatsApp
 * e busca. Fixar "Meta" sujaria o CPL e o CAC do dashboard — orgânico entraria
 * como se tivesse custo de mídia.
 *
 * Quem sabe a origem é a UTM que veio no link. Sem UTM, é acesso direto ou
 * orgânico. É a leitura honesta do dado que existe.
 * ------------------------------------------------------------------ */

function canal(d: LeadLimpo): 'META' | 'ORGANICO' {
  const fonte = `${d.utmSource} ${d.src}`.toLowerCase();
  const pago = /meta|facebook|fb|instagram|ig\b/.test(fonte) &&
               !/organic|organico|bio/.test(`${d.utmMedium}`.toLowerCase());
  return pago ? 'META' : 'ORGANICO';
}

/* ------------------------------------------------------------------ *
 * Prioridade — quem atende primeiro
 * Não é nota de crédito: é ordem de fila. Loja com estoque grande, volume
 * de venda e verba declarada merece resposta mais rápida.
 * ------------------------------------------------------------------ */

function prioridade(d: LeadLimpo): 'alta' | 'media' | 'baixa' {
  let p = 0;
  if (['41–70', '71–100', '+100'].includes(d.estoque)) p += 2;
  if (['21–40', '41–70', '+70'].includes(d.vendas)) p += 2;
  if (d.trafego === 'Sim') p += 1;
  if (d.investimento && d.investimento !== 'Até R$ 1.500') p += 2;
  return p >= 5 ? 'alta' : p >= 3 ? 'media' : 'baixa';
}

/* ------------------------------------------------------------------ *
 * Gravar no banco do Legacy OS
 * Usa o modelo de lead que o CRM já tem. Nada de tabela paralela: lead da
 * landing é lead, e tem que aparecer no mesmo funil do resto.
 * ------------------------------------------------------------------ */

async function salvarLead(
  d: LeadLimpo,
  extra: { ip: string; prioridade: string; canal: 'META' | 'ORGANICO' }
) {
  // Entra no topo da coluna "Lead", igual ao que é cadastrado na mão — é onde
  // o olho procura quem acabou de chegar.
  const primeiro = await prisma.lead.findFirst({
    where: { stage: 'LEAD' },
    orderBy: { position: 'asc' },
    select: { position: true },
  });

  const lead = await prisma.lead.create({
    data: {
      companyName: d.loja,
      contactName: d.nome,
      phone: d.whatsappDigitos, // só dígitos, pronto para disparo
      city: d.cidade,
      state: d.estado,
      stage: 'LEAD', // padrão do pipeline
      channel: extra.canal, // META ou ORGANICO, conforme a UTM
      position: (primeiro?.position ?? 0) - 1,
      notes: resumo(d, extra),
    },
    select: { id: true },
  });

  return lead.id;
}

/* Os campos de qualificação não existem no modelo de lead do CRM e não vale
   criar uma coluna para cada um agora. Vão para as anotações do cartão, em
   texto legível — quem abrir o lead vê a operação inteira de uma vez.
   Se um dia virarem filtro de verdade, aí sim viram colunas. */
function resumo(d: LeadLimpo, extra: { prioridade: string }) {
  return [
    `Veio da landing (formulário de diagnóstico) · prioridade ${extra.prioridade}`,
    `Estoque: ${d.estoque} · vende ${d.vendas}/mês`,
    `Tráfego pago: ${d.trafego}${d.verba ? ` — ${d.verba}/mês` : ''}`,
    d.investimento ? `Disposto a investir: ${d.investimento}/mês` : null,
    `Maior desafio: ${d.desafio}`,
    '',
    d.utmCampaign || d.utmSource
      ? `Campanha: ${d.utmSource || '—'} / ${d.utmCampaign || '—'} / ${d.utmContent || '—'}`
      : 'Sem UTM (acesso direto ou orgânico)',
    d.referencia && d.referencia !== 'direto' ? `Veio de: ${d.referencia}` : null,
  ].filter((l) => l !== null).join('\n');
}

function montaProtocolo(id: string | number) {
  const ano = new Date().getFullYear();
  const sufixo = String(id).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `LG-${ano}-${sufixo}`;
}

/* ------------------------------------------------------------------ *
 * Notificar a equipe
 * Nunca deixar a notificação derrubar a resposta: o lead já está salvo.
 *
 * O sistema ainda não tem canal próprio de aviso (WhatsApp, e-mail ou push).
 * Enquanto não tiver, o aviso sai no log da Vercel e, se existir a variável
 * LEAD_WEBHOOK_URL, vai também num POST pra ela — serve pra plugar Zapier,
 * Make ou API de WhatsApp sem mexer nesta rota de novo.
 * ------------------------------------------------------------------ */

async function notificar(d: LeadLimpo, protocolo: string, p: string) {
  const linhas = [
    `🚗 LEAD NOVO · prioridade ${p.toUpperCase()} · ${protocolo}`,
    `${d.nome} — ${d.loja}`,
    `${d.cidade}/${d.estado} · ${d.whatsapp}`,
    `Estoque ${d.estoque} · vende ${d.vendas}/mês`,
    `Tráfego: ${d.trafego}${d.verba ? ` (${d.verba})` : ''}`,
    d.investimento ? `Disposto a investir: ${d.investimento}` : '',
    `Desafio: ${d.desafio}`,
    d.utmCampaign ? `Campanha: ${d.utmCampaign} / ${d.utmContent}` : 'Origem: direto',
  ].filter(Boolean);

  const mensagem = linhas.join('\n');
  console.log(mensagem);

  const destino = process.env.LEAD_WEBHOOK_URL?.trim();
  if (!destino) return;

  await fetch(destino, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocolo,
      prioridade: p,
      mensagem,
      lead: {
        nome: d.nome, loja: d.loja, whatsapp: d.whatsappDigitos,
        cidade: d.cidade, estado: d.estado,
        estoque: d.estoque, vendas: d.vendas, trafego: d.trafego,
        verba: d.verba, investimento: d.investimento, desafio: d.desafio,
      },
    }),
    signal: AbortSignal.timeout(5000),
  });
}

/* ------------------------------------------------------------------ *
 * A rota
 * ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const origem = req.headers.get('origin');
  const cors = cabecalhosCors(origem);

  if (!origem || !ORIGENS_LIBERADAS.has(origem)) {
    return NextResponse.json({ erro: 'origem não autorizada' }, { status: 403, headers: cors });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido';
  if (await passouDoLimite(ip)) {
    return NextResponse.json({ erro: 'muitos envios' }, { status: 429, headers: cors });
  }

  let corpo: Record<string, unknown> | null;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'json inválido' }, { status: 400, headers: cors });
  }

  // A landing não envia o honeypot. Se ele veio, não foi a landing.
  if (texto(corpo?.empresa_site)) {
    // Responde 200 para o bot achar que deu certo, mas não grava nada.
    return NextResponse.json({ ok: true }, { status: 200, headers: cors });
  }

  const resultado = valida(corpo);
  if (!resultado.ok) {
    return NextResponse.json({ erro: `campo inválido: ${resultado.erro}` }, { status: 422, headers: cors });
  }

  const dados = resultado.dados;
  const p = prioridade(dados);
  const c = canal(dados);

  let id: string | number;
  try {
    id = await salvarLead(dados, { ip, prioridade: p, canal: c });
  } catch (e) {
    console.error('[lead-publico] falha ao salvar', e);
    // 5xx faz a landing cair no plano B do WhatsApp — o lead não se perde.
    return NextResponse.json({ erro: 'falha ao gravar' }, { status: 500, headers: cors });
  }

  const protocolo = montaProtocolo(id);

  // Notificação não bloqueia a resposta nem derruba o lead já salvo.
  notificar(dados, protocolo, p).catch((e) => console.error('[lead-publico] notificação falhou', e));

  return NextResponse.json({ protocolo }, { status: 201, headers: cors });
}
