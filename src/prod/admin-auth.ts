import type { AdminRoleName, AdminActor } from "./access.ts";
import { verifyPassword } from "./passwords.ts";

export type StoredAdmin = {
  login: string;
  passwordHash: string;
  role: AdminRoleName;
  branchId: string | null;
};

export const authenticateAdmin = (accounts: StoredAdmin[], envLogin: string, envPassword: string, login: string, password: string): AdminActor | null => {
  const account = accounts.find((row) => row.login === login);
  if (account) {
    if (!verifyPassword(password, account.passwordHash)) {
      return null;
    }
    return { login: account.login, role: account.role, branchId: account.branchId };
  }
  if (accounts.length > 0) {
    return null;
  }
  if (login === envLogin && password === envPassword && password.length > 0) {
    return { login, role: "owner", branchId: null };
  }
  return null;
};
