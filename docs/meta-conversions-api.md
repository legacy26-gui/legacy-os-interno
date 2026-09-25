# Conversions API da Meta

O Pixel só enxerga o que acontece no site. Ele vê o formulário preenchido e
para por aí — não sabe se aquele lead era bom, se virou reunião ou se fechou
contrato. Resultado: o anúncio otimiza por **volume de formulário**, e o
formulário mais barato costuma ser o pior.

A Conversions API resolve isso: quando o cartão anda no CRM, o servidor conta
pra Meta o que aconteceu com aquela pessoa.

## Os três eventos

| No CRM | Vai pra Meta | action_source | Valor |
|---|---|---|---|
| Lead entrou pela landing | `Lead` | `website` | — |
| Cartão chegou em Qualificado | `QualifiedLead` (custom) | `system_generated` | — |
| Cartão chegou em Fechado | `Purchase` | `system_generated` | mensalidade × meses + entrada |

O `Lead` é `website` porque aconteceu no site de verdade. Os outros dois
nascem aqui dentro, então são `system_generated`.

Todos levam `event_source_url`, o `fbc` e o `fbp` guardados no lead, e o
telefone com SHA-256 em E.164 sem o `+` (`5542999016794`) — é assim que a Meta
casa a pessoa. Junto vão também nome, cidade, estado e país com hash, e o IP e
o navegador em claro (a Meta não aceita esses dois com hash). Quanto mais
campo, melhor a taxa de correspondência.

## Deduplicação — o ponto que estraga o CPL se errar

O Pixel já dispara `Lead` no navegador quando o formulário é enviado. Se o
servidor mandar outro `Lead` com id diferente, a Meta conta **dois** e o CPL
aparece pela metade do que realmente é.

Por isso a landing precisa mandar, no corpo do POST, o mesmo `event_id` que
usou no Pixel:

```js
const eventId = crypto.randomUUID();
fbq('track', 'Lead', {}, { eventID: eventId });
// ... e o mesmo eventId vai no corpo do POST para /api/publico/leads
```

Sem esse campo o sistema gera um id próprio, o evento até chega, mas **não
deduplica**.

Nos eventos que nascem no CRM o id é fixo por lead (`qualifiedlead-<id>`,
`purchase-<id>`): se o cartão for e voltar de coluna, a Meta não conta duas
vezes. O sistema também guarda o que já enviou e não repete.

## Variáveis de ambiente (Vercel)

| Variável | O que é |
|---|---|
| `META_CAPI_TOKEN` | **A única obrigatória.** Token de acesso gerado no Gerenciador de Eventos |
| `META_PIXEL_ID` | Opcional. O padrão já é `1795537647563349` (conjunto "Serviços profissionais"). Só preencha se o Pixel mudar |
| `META_TEST_EVENT_CODE` | **Só em teste.** Faz o evento aparecer na aba "Eventos de teste". Remover depois |
| `META_API_VERSION` | Opcional. Padrão `v21.0` |

O token **nunca** vai pro código nem pra landing: ele autoriza mandar evento em
nome da conta de anúncio.

Sem essas variáveis, tudo continua funcionando — o lead é salvo, o CRM anda,
só não sai evento.

## Conferir

- `GET /api/meta/eventos?key=SETUP_SECRET` → mostra se está configurada, quantos
  leads têm rastro de anúncio e os últimos 20 envios, com o erro de cada um que
  falhou.
- `POST /api/meta/eventos?key=SETUP_SECRET&lead=<id>` → reenvia os eventos
  daquele lead (apaga o registro anterior de propósito: serve pra tentar de novo
  o que falhou) e mostra o telefone no formato que a Meta recebe.

## Detalhes que importam

- **O IP e o navegador mandados são os do visitante**, lidos dos cabeçalhos da
  requisição que a landing faz pelo navegador do lojista — nunca os do nosso
  servidor. A ordem de leitura é `x-vercel-forwarded-for` (escrito pela Vercel,
  não dá pra forjar), depois `x-forwarded-for` e `x-real-ip`. Os eventos de
  estágio reusam o IP e o navegador guardados na hora do cadastro: são da
  pessoa, não de quem arrastou o cartão.
- **Lead sem rastro de anúncio não vira evento.** Quem chegou por indicação ou
  presencialmente não tem clique pra casar; mandar assim só sujaria a conta.
- Se a landing mandar `fbclid` mas não `fbc`, o sistema remonta o `fbc` no
  formato `fb.1.<timestamp>.<fbclid>`.
- O envio roda **depois** da resposta (`after()` do Next): a landing recebe o
  protocolo na hora e arrastar cartão no CRM não fica esperando a Meta.
- Falar com a Meta nunca derruba nada. Deu erro, fica registrado e o CRM segue.
