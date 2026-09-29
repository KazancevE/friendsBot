import type { PrismaClient } from "@prisma/client";
import type { AdminRoleName } from "./access.ts";
import type { StoredAdmin } from "./admin-auth.ts";

const toStored = (row: { login: string; passwordHash: string; role: AdminRoleName; branchId: string | null }): StoredAdmin => ({
  login: row.login,
  passwordHash: row.passwordHash,
  role: row.role,
  branchId: row.branchId,
});

export const createAdminDirectory = (prisma: PrismaClient) => ({
  async list(): Promise<StoredAdmin[]> {
    const rows = await prisma.adminAccount.findMany({ orderBy: { login: "asc" } });
    return rows.map((row) => toStored(row));
  },
  async create(input: { login: string; passwordHash: string; role: AdminRoleName; branchId: string | null }) {
    const row = await prisma.adminAccount.create({ data: input });
    return toStored(row);
  },
  async setPassword(login: string, passwordHash: string) {
    await prisma.adminAccount.update({ where: { login }, data: { passwordHash } });
  },
  async remove(login: string) {
    await prisma.adminAccount.delete({ where: { login } });
  },
});

export const ensureOwnerAccount = async (prisma: PrismaClient, login: string, passwordHash: string) => {
  const count = await prisma.adminAccount.count();
  if (count > 0) {
    return false;
  }
  await prisma.adminAccount.create({
    data: { login, passwordHash, role: "owner" },
  });
  return true;
};
