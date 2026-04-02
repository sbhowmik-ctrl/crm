import { Role } from "@prisma/client";

/** USER and INTERN: sidebar limited to Projects + Credentials + Notes; main dashboard overview is hidden (not settings). */
export const VAULT_MEMBER_ONLY_ROLES = new Set<Role>([Role.USER, Role.INTERN]);

export function isVaultMemberOnlyRole(role: Role): boolean {
  return VAULT_MEMBER_ONLY_ROLES.has(role);
}
