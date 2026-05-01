import { prisma } from "@/lib/prisma";

export async function getCurrentStaff() {
  const superAdmin = await prisma.staffUser.findFirst({ where: { role: "SUPER_ADMIN", isActive: true } });
  if (superAdmin) return superAdmin;
  return prisma.staffUser.findFirstOrThrow({ where: { isActive: true } });
}

export function canManageSettings(role: string, canSettings = false) {
  return role === "SUPER_ADMIN" || canSettings;
}

export function canAdjustPayments(role: string) {
  return role === "SUPER_ADMIN";
}
