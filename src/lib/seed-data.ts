import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_PASSWORD = "legacyos@2026";

const USERS = [
  { name: "Guilherme", email: "guilherme@legacydigital.com", role: "ADMIN" as const },
  { name: "Andriele", email: "andriele@legacydigital.com", role: "GERENTE" as const },
  { name: "Giovana", email: "giovana@legacydigital.com", role: "GESTOR_TRAFEGO" as const },
  { name: "Luiz", email: "luiz@legacydigital.com", role: "GESTOR_TRAFEGO" as const },
  { name: "Tatiana", email: "tatiana@legacydigital.com", role: "GESTOR_TRAFEGO" as const },
];

const TEMPLATES = [
  {
    id: "seed-trafego",
    name: "Contrato Tráfego Pago",
    type: "TRAFEGO_PAGO" as const,
    bodyTemplate:
      "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRÁFEGO PAGO\n\nCONTRATANTE: {{clientName}}, CNPJ {{clientCnpj}}, com sede em {{clientCity}}/{{clientState}}.\nCONTRATADA: Legacy Digital.\n\nOBJETO: Gestão de campanhas de tráfego pago (Meta Ads, Google Ads) para o CONTRATANTE.\nVALOR MENSAL: {{value}}\nPLANO: {{plan}}\nDATA DE INÍCIO: {{startDate}}\n\nAs partes firmam o presente contrato nos termos acima.",
  },
  {
    id: "seed-site",
    name: "Contrato Site",
    type: "SITE" as const,
    bodyTemplate:
      "CONTRATO DE DESENVOLVIMENTO DE SITE\n\nCONTRATANTE: {{clientName}}, CNPJ {{clientCnpj}}.\nCONTRATADA: Legacy Digital.\n\nOBJETO: Desenvolvimento e manutenção de site institucional.\nVALOR: {{value}}\nDATA DE INÍCIO: {{startDate}}",
  },
  {
    id: "seed-gestao",
    name: "Contrato Gestão Completa",
    type: "GESTAO_COMPLETA" as const,
    bodyTemplate:
      "CONTRATO DE GESTÃO COMPLETA DE MARKETING DIGITAL\n\nCONTRATANTE: {{clientName}}, CNPJ {{clientCnpj}}.\nCONTRATADA: Legacy Digital.\n\nOBJETO: Gestão completa de marketing digital, incluindo tráfego pago, produção de conteúdo, atendimento ao cliente e relatórios mensais.\nVALOR MENSAL: {{value}}\nPLANO: {{plan}}\nDATA DE INÍCIO: {{startDate}}",
  },
];

export async function runInitialSeed(prisma: PrismaClient) {
  const createdUsers: { email: string; role: string; created: boolean }[] = [];

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      createdUsers.push({ email: u.email, role: u.role, created: false });
      continue;
    }
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await prisma.user.create({ data: { ...u, passwordHash, mustChangePassword: true } });
    createdUsers.push({ email: u.email, role: u.role, created: true });
  }

  for (const t of TEMPLATES) {
    await prisma.contractTemplate.upsert({
      where: { id: t.id },
      update: { bodyTemplate: t.bodyTemplate },
      create: t,
    });
  }

  return { users: createdUsers, defaultPassword: DEFAULT_PASSWORD, templatesCount: TEMPLATES.length };
}
