export type AdminRoleName = "owner" | "branch_admin" | "master";

export type AdminActor = {
  login: string;
  role: AdminRoleName;
  branchId: string | null;
};

export type AdminAction = "read" | "write" | "network" | "accounts" | "privacy";

export const canDo = (actor: AdminActor, action: AdminAction) => {
  if (actor.role === "owner") {
    return true;
  }
  if (actor.role === "branch_admin") {
    return action === "read" || action === "write" || action === "privacy";
  }
  return action === "read";
};

export const scopedBranch = (actor: AdminActor, requested: string | undefined) => {
  if (actor.role === "owner" || (actor.role === "master" && !actor.branchId)) {
    return { branchId: requested || undefined };
  }
  if (!actor.branchId) {
    return { error: "У филиального администратора не указан филиал" };
  }
  if (requested && requested !== actor.branchId) {
    return { error: "Этот филиал вам не назначен" };
  }
  return { branchId: actor.branchId };
};

export const canDeleteAccount = (actor: AdminActor, target: AdminActor, ownerCount: number) => {
  if (actor.role !== "owner") {
    return "Управлять учётками может только владелец";
  }
  if (target.role === "owner" && ownerCount <= 1) {
    return "Нельзя удалить единственного владельца";
  }
  if (actor.login === target.login && ownerCount <= 1) {
    return "Нельзя удалить единственного владельца";
  }
  return null;
};
