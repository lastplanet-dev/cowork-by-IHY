import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getCurrentStaff() {
  const staffId = (await cookies()).get("coworkStaffId")?.value;
  if (staffId) {
    const sessionStaff = await prisma.staffUser.findFirst({ where: { id: staffId, isActive: true } });
    if (sessionStaff) return sessionStaff;
  }

  const superAdmin = await prisma.staffUser.findFirst({ where: { role: "SUPER_ADMIN", isActive: true } });
  if (superAdmin) return superAdmin;
  return prisma.staffUser.findFirstOrThrow({ where: { isActive: true } });
}

export async function getActiveLocation() {
  const activeLocationSetting = await prisma.setting.findUnique({ where: { key: "activeLocationId" } });
  if (activeLocationSetting?.value) {
    const location = await prisma.location.findUnique({ where: { id: activeLocationSetting.value } });
    if (location) return location;
  }

  const firstLocation = await prisma.location.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (firstLocation) return firstLocation;

  return prisma.location.create({ data: { name: "IHY Downtown", address: "Main coworking space" } });
}

export async function getOperationalLocation() {
  const staff = await getCurrentStaff();
  if (staff.role !== "SUPER_ADMIN" && staff.locationId) {
    const staffLocation = await prisma.location.findFirst({ where: { id: staff.locationId, isActive: true } });
    if (staffLocation) return staffLocation;
  }

  return getActiveLocation();
}

export async function getSelectableLocations() {
  const staff = await getCurrentStaff();
  if (staff.role === "SUPER_ADMIN") {
    return prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  }

  if (staff.locationId) {
    return prisma.location.findMany({ where: { id: staff.locationId, isActive: true }, orderBy: { name: "asc" } });
  }

  return prisma.location.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 1 });
}

export function canManageSettings(role: string, canSettings = false) {
  return role === "SUPER_ADMIN" || canSettings;
}

export function canAdjustPayments(role: string) {
  return role === "SUPER_ADMIN";
}
