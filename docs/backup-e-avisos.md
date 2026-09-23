# Backup do banco e aviso de lead no celular

Duas coisas que não aparecem na tela mas seguram a operação: a cópia do banco
fora do Neon e o aviso que chega no celular quando entra lead.

## Backup diário

O Neon guarda uma **janela de histórico** (6 horas no plano grátis, 1 dia no
pago, configurável até 7 ou 30 dias conforme o plano). Isso cobre o erro que se
percebe na hora — não cobre problema na conta nem erro descoberto duas semanas
depois. Por isso existe uma cópia independente.

`/.github/workflows/backup-banco.yml` roda todo dia às 03:00 de Brasília, tira
um `pg_dump` completo, confere que ele não veio vazio, criptografa com AES256 e
guarda como artefato do GitHub por 30 dias. Também dá pra rodar na mão pelo
botão **Run workflow** — vale fazer antes de qualquer mudança grande.

### O que precisa estar configurado

Em **Settings → Secrets and variables → Actions**:

| Segredo | O que é |
|---|---|
| `DATABASE_URL` | A string de conexão do Neon, a mesma que está na Vercel |
| `BACKUP_PASSPHRASE` | Uma senha forte, guardada no gerenciador de senhas |

**Sem a senha o arquivo não abre — nem por você.** Guarde antes de precisar.

### Como restaurar

1. Baixe o artefato na aba **Actions** do repositório.
2. Descriptografe: `gpg --decrypt backup.dump.gpg > backup.dump`
3. Restaure num banco vazio:
   `pg_restore --no-owner --no-privileges -d "<url do banco novo>" backup.dump`

Pra recuperar só uma tabela, `pg_restore --list backup.dump` mostra tudo que
está lá dentro e `-t <tabela>` restaura só ela.

Vale testar a restauração uma vez, num banco de brinquedo. Backup que nunca foi
restaurado é só um arquivo com nome bonito.

## Aviso de lead no celular

Quando alguém envia o formulário da landing, `POST /api/publico/leads` grava o
lead e dispara um aviso. O aviso vai pelo **push do próprio app** (PWA) que a
equipe instalou — não depende de serviço pago, de e-mail nem de terceiro: quem
entrega é o navegador, e quem mostra na tela de bloqueio é o celular.

### Ligar

1. Gerar o par de chaves: `GET /api/push/chaves?key=SETUP_SECRET&gerar=1`
2. Colar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` nas variáveis
   de ambiente da Vercel (Production, Preview e Development) e fazer um redeploy.
3. Cada pessoa abre o **Comercial** no celular, com o app instalado, e toca em
   **"Receber avisos"**. A permissão é por aparelho.
4. Testar: `POST /api/push/chaves?key=SETUP_SECRET` manda um aviso pra todo
   mundo inscrito e responde quantos aparelhos receberam.

Gerar as chaves de novo invalida as inscrições que já existem — todo mundo
precisaria tocar em "Receber avisos" outra vez.

`GET /api/push/chaves?key=SETUP_SECRET` mostra se está configurado e quais
aparelhos estão inscritos.

### Detalhes que importam

- **iPhone só recebe push se o app estiver instalado na tela de início**
  (iOS 16.4+). No Safari comum não chega. Android funciona dos dois jeitos.
- Inscrição que morre (app desinstalado, permissão revogada) é apagada sozinha
  no primeiro envio que falhar com 404/410.
- O aviso vale por 12 horas: lead de madrugada ainda aparece de manhã.
- Dois leads seguidos são dois avisos — um nunca substitui o outro.
- Notificação nunca derruba a resposta da rota: o lead é salvo primeiro.

### Outro caminho, se precisar

Se existir a variável `LEAD_WEBHOOK_URL`, cada lead também vira um POST pra ela,
com os campos separados em JSON. Serve pra ligar Zapier, Make ou uma API de
WhatsApp sem mexer no código da rota.
