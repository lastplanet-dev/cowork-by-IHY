type PrismaLike = Record<string, unknown>;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaLike };

function getPrisma() {
  if (!globalForPrisma.prisma) {
    // Lazy load keeps Next's build-time route scanner from requiring a generated
    // Prisma client before the local database setup command has run.
    const { PrismaClient } = require("@prisma/client");
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
    });
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      return Reflect.get(getPrisma() as object, prop);
    }
  }
) as any;
