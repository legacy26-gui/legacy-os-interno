// Aplica as migrações — mas SÓ na implantação de produção.
//
// ── Por que isto existe ───────────────────────────────────────────────────
//
// O `vercel-build` rodava `prisma migrate deploy` em toda implantação. E a
// Vercel constrói DUAS por commit: uma de Preview (do branch) e uma de
// Production (da main), ao mesmo tempo. As duas apontam pro mesmo banco.
//
// No dia 13/11/2026 as duas tentaram aplicar a migração `meta_acoes` no mesmo
// segundo. Uma aplicou; a outra encontrou a tabela já criada, falhou no meio
// e deixou a linha marcada como quebrada em `_prisma_migrations`.
//
// A partir dali, TODO build passou a morrer em dez segundos com:
//
//   migrate found failed migrations in the target database,
//   new migrations will not be applied
//
// E o Prisma está certo em recusar: aplicar migração nova em cima de uma
// quebrada é como continuar construindo em cima de parede torta. O problema
// não era a recusa — era eu ter posto duas coisas pra escrever no mesmo banco
// ao mesmo tempo.
//
// ── Por que isso é quase invisível ────────────────────────────────────────
//
// O site não cai: continua servindo a última implantação que deu certo. Só
// para de receber novidade. Quem olha vê tudo funcionando e não desconfia de
// nada — a gente levou horas pra perceber, e só porque fui conferir outra
// coisa.
//
// Preview não precisa migrar: ela roda contra o mesmo banco que já está
// migrado pela produção. Quando um dia houver banco separado por ambiente,
// esta regra muda de lugar, não de ideia.

import { spawnSync } from "node:child_process";

const ambiente = process.env.VERCEL_ENV ?? "local";

if (ambiente !== "production") {
  console.log(
    `[migrar] Ambiente "${ambiente}": não aplico migração. ` +
      `Só a implantação de produção mexe no banco — duas ao mesmo tempo se atropelam.`
  );
  process.exit(0);
}

console.log("[migrar] Produção: aplicando migrações pendentes.");
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });

if (r.status !== 0) {
  console.error("[migrar] A migração falhou. O build para aqui de propósito.");
  process.exit(r.status ?? 1);
}
