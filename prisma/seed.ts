import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runInitialSeed } from "../src/lib/seed-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding users and contract templates...\n");
  const result = await runInitialSeed(prisma);
  for (const u of result.users) {
    console.log(`  ${u.role.padEnd(16)} ${u.email} ${u.created ? "(criado)" : "(já existia)"}`);
  }
  console.log(`\nSenha padrão dos usuários novos: ${result.defaultPassword} (troca obrigatória no primeiro login)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
