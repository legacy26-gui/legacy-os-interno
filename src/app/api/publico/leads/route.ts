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

import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { avisarTodos } from '@/lib/push';
import { enviarEventoMeta } from '@/lib/meta-capi';

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
 * Quem está do outro lado
 *
 * O IP e o navegador que a Meta precisa são os DO VISITANTE, não os do nosso
 * servidor. Como a landing chama esta rota do navegador do lojista, eles vêm
 * nos cabeçalhos da própria requisição.
 *
 * `x-vercel-forwarded-for` vem primeiro porque é a Vercel que escreve: o
 * `x-forwarded-for` comum pode ser forjado por quem manda o POST.
 * ------------------------------------------------------------------ */

function ipDoVisitante(req: NextRequest) {
  const candidatos = [
    req.headers.get('x-vercel-forwarded-for'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
    req.headers.get('x-real-ip'),
  ];
  for (const c of candidatos) {
    const ip = c?.trim();
    if (ip) return ip;
  }
  return 'desconhecido';
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
  estoque: string | null; vendas: string | null; trafego: string | null;
  verba: string | null; desafio: string | null; investimento: string | null;
  naoReconhecido: string[];
  utmSource: string; utmMedium: string; utmCampaign: string;
  utmContent: string; utmTerm: string; utmId: string; src: string;
  pagina: string; referencia: string; enviadoEm: Date;
  // Rastro do clique no anúncio e o id que o Pixel usou no navegador.
  fbclid: string; fbc: string; fbp: string; eventId: string;
};

function texto(v: unknown, max = 120) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Compara opção de lista sem brigar com tipografia: travessão x hífen, acento,
// espaço, ponto de milhar, "R$". A landing pode digitar "21-40" e a lista aqui
// ter "21–40" — isso não pode custar um lead.
function chave(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/r\$/g, '')
    .replace(/[.\s]/g, '');
}

function daLista(lista: string[], valor: string) {
  if (!valor) return null;
  const k = chave(valor);
  return lista.find((o) => chave(o) === k) ?? null;
}

/**
 * Regra de recusa, decidida na marra depois de perder cinco leads de anúncio:
 * só barra o que impede de atender a pessoa — nome, loja e um WhatsApp
 * discável. Todo o resto é melhor esforço.
 *
 * Uma resposta de múltipla escolha que não bate com a lista NÃO derruba o
 * envio: o valor cru vai pras anotações do cartão. Um lead que custou dinheiro
 * de anúncio não pode ser jogado fora porque veio "21-40" em vez de "21–40".
 * Contra robô quem trabalha é o Origin, o limite por IP e o honeypot.
 */
function valida(corpo: Record<string, unknown> | null): Resultado {
  const nome = texto(corpo?.nome, 120);
  const loja = texto(corpo?.loja, 120);
  const whatsapp = texto(corpo?.whatsapp, 20) || texto(corpo?.telefone, 20);
  const digitos = whatsapp.replace(/\D/g, '');

  if (nome.length < 2) return { ok: false, erro: 'nome' };
  if (loja.length < 2) return { ok: false, erro: 'loja' };

  // 10 ou 11 dígitos, DDD entre 11 e 99.
  const ddd = Number(digitos.slice(0, 2));
  if (digitos.length < 10 || digitos.length > 11 || ddd < 11 || ddd > 99) {
    return { ok: false, erro: 'whatsapp' };
  }

  const cidade = texto(corpo?.cidade, 80);
  const estadoBruto = texto(corpo?.estado, 2).toUpperCase() || texto(corpo?.uf, 2).toUpperCase();
  const estado = UFS.includes(estadoBruto) ? estadoBruto : '';

  const brutos = {
    estoque: texto(corpo?.estoque, 40),
    vendas: texto(corpo?.vendas, 40),
    trafego: texto(corpo?.trafego, 10),
    desafio: texto(corpo?.desafio, 60),
    verba: texto(corpo?.verba, 40),
    investimento: texto(corpo?.investimento, 40),
  };

  const estoque = daLista(ESTOQUE, brutos.estoque);
  const vendas = daLista(VENDAS, brutos.vendas);
  const desafio = daLista(DESAFIOS, brutos.desafio);
  const trafegoK = chave(brutos.trafego);
  const trafego = ['sim', 'true', '1'].includes(trafegoK)
    ? 'Sim'
    : ['nao', 'false', '0'].includes(trafegoK)
      ? 'Não'
      : null;
  const verba = daLista(VERBA, brutos.verba);
  const investimento = daLista(INVESTIMENTO, brutos.investimento);

  // O que chegou fora da lista não some: vai pra anotação, pra equipe ver e
  // pra gente descobrir o que a landing está mandando de diferente.
  const naoReconhecido: string[] = [];
  const anota = (rotulo: string, bruto: string, casou: string | null) => {
    if (bruto && !casou) naoReconhecido.push(`${rotulo}: ${bruto}`);
  };
  anota('estoque', brutos.estoque, estoque);
  anota('vendas', brutos.vendas, vendas);
  anota('desafio', brutos.desafio, desafio);
  anota('tráfego', brutos.trafego, trafego);
  anota('verba', brutos.verba, verba);
  anota('investimento', brutos.investimento, investimento);
  if (estadoBruto && !estado) naoReconhecido.push(`UF: ${estadoBruto}`);

  return {
    ok: true,
    dados: {
      nome, whatsapp, whatsappDigitos: digitos, loja, cidade, estado,
      estoque, vendas, trafego, verba, desafio, investimento,
      naoReconhecido,
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
      fbclid: texto(corpo?.fbclid, 500),
      fbc: texto(corpo?.fbc, 500),
      fbp: texto(corpo?.fbp, 200),
      // O Pixel já disparou "Lead" no navegador com este id. Mandar o mesmo id
      // no evento do servidor é o que faz a Meta entender que é UM lead, e não
      // dois — sem isso o CPL sai pela metade do que é de verdade.
      eventId: texto(corpo?.event_id, 100),
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
  if (d.estoque && ['41–70', '71–100', '+100'].includes(d.estoque)) p += 2;
  if (d.vendas && ['21–40', '41–70', '+70'].includes(d.vendas)) p += 2;
  if (d.trafego === 'Sim') p += 1;
  if (d.investimento && d.investimento !== 'Até R$ 1.500') p += 2;
  return p >= 5 ? 'alta' : p >= 3 ? 'media' : 'baixa';
}

/* ------------------------------------------------------------------ *
 * Gravar no banco do Legacy OS
 * Usa o modelo de lead que o CRM já tem. Nada de tabela paralela: lead da
 * landing é lead, e tem que aparecer no mesmo funil do resto.
 * ------------------------------------------------------------------ */

// A Meta quer o endereço completo da página onde o lead aconteceu. A landing
// manda o caminho; se vier só isso, completa com o domínio dela.
function enderecoDaPagina(pagina: string) {
  if (!pagina) return 'https://legacyautomotivo.com.br/';
  if (/^https?:\/\//i.test(pagina)) return pagina;
  return `https://legacyautomotivo.com.br${pagina.startsWith('/') ? '' : '/'}${pagina}`;
}

async function salvarLead(
  d: LeadLimpo,
  extra: { ip: string; prioridade: string; canal: 'META' | 'ORGANICO'; userAgent: string | null }
) {
  // Entra no topo da coluna "Lead", igual ao que é cadastrado na mão — é onde
  // o olho procura quem acabou de chegar.
  const primeiro = await prisma.lead.findFirst({
    where: { empresa: 'AGENCIA', stage: 'LEAD' },
    orderBy: { position: 'asc' },
    select: { position: true },
  });

  const lead = await prisma.lead.create({
    data: {
      // Esta rota é o formulário da landing da agência (legacyautomotivo).
      // Fica escrito em vez de confiar no padrão do banco: se um dia existir
      // uma landing do Treinamentos, ela vai ter rota própria e empresa própria.
      empresa: 'AGENCIA',
      companyName: d.loja,
      contactName: d.nome,
      phone: d.whatsappDigitos, // só dígitos, pronto para disparo
      city: d.cidade || null,
      state: d.estado || null,
      stage: 'LEAD', // padrão do pipeline
      channel: extra.canal, // META ou ORGANICO, conforme a UTM
      position: (primeiro?.position ?? 0) - 1,
      notes: resumo(d, extra),
      // Guardado pra Conversions API conseguir casar este lead com o clique
      // que o trouxe, agora e nas etapas seguintes do funil.
      fbclid: d.fbclid || null,
      fbc: d.fbc || null,
      fbp: d.fbp || null,
      pixelEventId: d.eventId || null,
      landingUrl: enderecoDaPagina(d.pagina),
      clientIp: extra.ip !== 'desconhecido' ? extra.ip : null,
      clientUserAgent: extra.userAgent,
    },
    select: {
      id: true, contactName: true, phone: true, city: true, state: true,
      fbc: true, fbp: true, fbclid: true, landingUrl: true,
      clientIp: true, clientUserAgent: true, pixelEventId: true,
    },
  });

  return lead;
}

/* Os campos de qualificação não existem no modelo de lead do CRM e não vale
   criar uma coluna para cada um agora. Vão para as anotações do cartão, em
   texto legível — quem abrir o lead vê a operação inteira de uma vez.
   Se um dia virarem filtro de verdade, aí sim viram colunas. */
function resumo(d: LeadLimpo, extra: { prioridade: string }) {
  return [
    `Veio da landing (formulário de diagnóstico) · prioridade ${extra.prioridade}`,
    `Estoque: ${d.estoque ?? '—'} · vende ${d.vendas ?? '—'}/mês`,
    `Tráfego pago: ${d.trafego ?? '—'}${d.verba ? ` — ${d.verba}/mês` : ''}`,
    d.investimento ? `Disposto a investir: ${d.investimento}/mês` : null,
    `Maior desafio: ${d.desafio ?? '—'}`,
    // Resposta que não bateu com a lista não some: fica aqui, legível.
    d.naoReconhecido.length ? `Respostas fora do padrão — ${d.naoReconhecido.join(' · ')}` : null,
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
 * Caminho principal: push no celular de quem ligou o aviso no Legacy OS. É o
 * único que acorda alguém de madrugada — lead que só é visto no dia seguinte
 * já está frio.
 *
 * Além disso: log da Vercel sempre, e um POST pra LEAD_WEBHOOK_URL se ela
 * existir — serve pra plugar Zapier, Make ou API de WhatsApp sem mexer aqui.
 * ------------------------------------------------------------------ */

async function notificar(d: LeadLimpo, protocolo: string, p: string) {
  const linhas = [
    `🚗 LEAD NOVO · prioridade ${p.toUpperCase()} · ${protocolo}`,
    `${d.nome} — ${d.loja}`,
    `${d.cidade || '—'}${d.estado ? '/' + d.estado : ''} · ${d.whatsapp}`,
    `Estoque ${d.estoque ?? '—'} · vende ${d.vendas ?? '—'}/mês`,
    `Tráfego: ${d.trafego ?? '—'}${d.verba ? ` (${d.verba})` : ''}`,
    d.investimento ? `Disposto a investir: ${d.investimento}` : '',
    `Desafio: ${d.desafio ?? '—'}`,
    d.utmCampaign ? `Campanha: ${d.utmCampaign} / ${d.utmContent}` : 'Origem: direto',
  ].filter(Boolean);

  const mensagem = linhas.join('\n');
  console.log(mensagem);

  // O título é o que aparece na tela de bloqueio; o corpo tem o que decide
  // quem atende primeiro, sem precisar abrir o sistema.
  await avisarTodos({
    titulo: `🚗 Lead ${p} · ${d.loja}`,
    corpo: [
      `${d.nome} · ${d.cidade || '—'}${d.estado ? '/' + d.estado : ''} · ${d.whatsapp}`,
      `Estoque ${d.estoque ?? '—'} · vende ${d.vendas ?? '—'}/mês`,
      d.investimento ? `Investe: ${d.investimento}` : `Tráfego pago: ${d.trafego ?? '—'}`,
      `Desafio: ${d.desafio ?? '—'}`,
    ].join('\n'),
    url: '/comercial',
    // Aviso de lead nunca substitui o anterior: dois leads seguidos são dois
    // avisos, senão o segundo apaga o primeiro antes de alguém ver.
    tag: `lead-${protocolo}`,
  });

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
 * Caixa preta
 *
 * Tudo que chega e NÃO vira lead fica guardado com o corpo cru. Foi escrito
 * depois de perder cinco leads de anúncio sem deixar rastro: o Pixel contou os
 * cinco envios e não havia onde olhar pra saber o que tinha acontecido.
 * Guardar custa quase nada; perder um lead pago custa caro.
 * ------------------------------------------------------------------ */

async function registrarRecusa(
  req: NextRequest,
  status: number,
  motivo: string,
  corpo: unknown
) {
  try {
    await prisma.leadRecusado.create({
      data: {
        motivo,
        status,
        origem: req.headers.get('origin')?.slice(0, 200) ?? null,
        ip: ipDoVisitante(req),
        corpo: (typeof corpo === 'string' ? corpo : JSON.stringify(corpo ?? null)).slice(0, 10_000),
      },
    });
  } catch (e) {
    // Guardar o problema não pode virar outro problema.
    console.error('[lead-publico] não consegui registrar a recusa', e);
  }
  console.warn(`[lead-publico] recusado (${status}): ${motivo}`);
}

/**
 * Lê o corpo da requisição. Tenta JSON e, se não for, tenta formulário comum —
 * uma landing que mude o jeito de enviar não pode derrubar a captação.
 */
async function lerCorpo(texto: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(texto);
  } catch {
    try {
      const params = new URLSearchParams(texto);
      if ([...params.keys()].length === 0) return null;
      return Object.fromEntries(params.entries());
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ *
 * A rota
 * ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const origem = req.headers.get('origin');
  const cors = cabecalhosCors(origem);

  if (!origem || !ORIGENS_LIBERADAS.has(origem)) {
    await registrarRecusa(req, 403, `origem não autorizada: ${origem ?? 'sem Origin'}`, await req.text().catch(() => ''));
    return NextResponse.json({ erro: 'origem não autorizada' }, { status: 403, headers: cors });
  }

  const ip = ipDoVisitante(req);
  const bruto = await req.text().catch(() => '');

  if (await passouDoLimite(ip)) {
    await registrarRecusa(req, 429, 'passou do limite de envios por IP', bruto);
    return NextResponse.json({ erro: 'muitos envios' }, { status: 429, headers: cors });
  }

  const corpo = await lerCorpo(bruto);
  if (!corpo) {
    await registrarRecusa(req, 400, 'corpo ilegível (nem JSON nem formulário)', bruto);
    return NextResponse.json({ erro: 'json inválido' }, { status: 400, headers: cors });
  }

  // A landing não envia o honeypot. Se ele veio, não foi a landing.
  if (texto(corpo?.empresa_site)) {
    // Responde 200 para o bot achar que deu certo, mas não grava nada.
    return NextResponse.json({ ok: true }, { status: 200, headers: cors });
  }

  const resultado = valida(corpo);
  if (!resultado.ok) {
    await registrarRecusa(req, 422, `campo inválido: ${resultado.erro}`, bruto);
    return NextResponse.json({ erro: `campo inválido: ${resultado.erro}` }, { status: 422, headers: cors });
  }

  const dados = resultado.dados;
  const p = prioridade(dados);
  const c = canal(dados);

  let lead: Awaited<ReturnType<typeof salvarLead>>;
  try {
    lead = await salvarLead(dados, {
      ip,
      prioridade: p,
      canal: c,
      userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.error('[lead-publico] falha ao salvar', e);
    // Mesmo sem conseguir gravar o lead, o que a pessoa digitou fica guardado:
    // dá pra ligar pra ela na mão em vez de perder o contato.
    await registrarRecusa(req, 500, `falha ao gravar: ${e instanceof Error ? e.message : String(e)}`, bruto);
    // 5xx faz a landing cair no plano B do WhatsApp — o lead não se perde.
    return NextResponse.json({ erro: 'falha ao gravar' }, { status: 500, headers: cors });
  }

  const protocolo = montaProtocolo(lead.id);

  // Aviso e Meta rodam DEPOIS da resposta: a landing recebe o protocolo na
  // hora, e nenhum dos dois derruba o lead que já está salvo.
  after(async () => {
    await notificar(dados, protocolo, p).catch((e) => console.error('[lead-publico] notificação falhou', e));
    // Lead sem rastro de anúncio não tem o que casar na Meta.
    if (dados.fbc || dados.fbp || dados.fbclid) {
      await enviarEventoMeta(lead, 'Lead').catch((e) => console.error('[lead-publico] Meta falhou', e));
    }
  });

  return NextResponse.json({ protocolo }, { status: 201, headers: cors });
}
