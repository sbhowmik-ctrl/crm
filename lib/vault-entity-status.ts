/**
 * Runtime-safe values for Prisma `VaultEntityStatus`.
 * Use these instead of `VaultEntityStatus` from `@prisma/client` in app code:
 * some bundler graphs evaluate modules before Prisma's enum exports exist, which
 * caused `Cannot read properties of undefined (reading 'ACTIVE')`.
 */

import { Role } from "@prisma/client";

export const VAULT_ENTITY_STATUS = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  DELETED: "DELETED",
} as const;

/** `Project` / `Note` rows visible in the live vault (not archived or soft-deleted). */
export const vaultWhereActive = { status: VAULT_ENTITY_STATUS.ACTIVE };

/** Projects that still expose secrets/notes: active or archived (excludes soft-deleted). */
export const vaultWhereActiveOrArchived = {
  status: { in: [VAULT_ENTITY_STATUS.ACTIVE, VAULT_ENTITY_STATUS.ARCHIVED] },
};

/**
 * `Project.status` / `Note.status` when reading vault content.
 * USER/INTERN: active only. MODERATOR+ may read archived rows too (not deleted).
 */
function vaultEntityStatusWhereForRead(actor: { role: Role }) {
  if (actor.role === Role.USER || actor.role === Role.INTERN) {
    return vaultWhereActive;
  }
  return vaultWhereActiveOrArchived;
}

export function projectWhereForVaultRead(actor: { role: Role }) {
  return vaultEntityStatusWhereForRead(actor);
}

/** Same visibility rules as {@link projectWhereForVaultRead} for `Note.status`. */
export function noteWhereForVaultRead(actor: { role: Role }) {
  return vaultEntityStatusWhereForRead(actor);
}

/** Same visibility rules for `CredentialSection.status` (list/detail reads). */
export function credentialSectionWhereForVaultRead(actor: { role: Role }) {
  return vaultEntityStatusWhereForRead(actor);
}

export type VaultEntityStatusValue =
  (typeof VAULT_ENTITY_STATUS)[keyof typeof VAULT_ENTITY_STATUS];

/** Parses `?status=` from the URL for project/note vault lists (case-insensitive). */
export function parseVaultStatusParam(
  raw: string | string[] | undefined,
): VaultEntityStatusValue {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const normalized =
    typeof v === "string" ? v.trim().toUpperCase() : undefined;
  if (
    normalized === VAULT_ENTITY_STATUS.ACTIVE ||
    normalized === VAULT_ENTITY_STATUS.ARCHIVED ||
    normalized === VAULT_ENTITY_STATUS.DELETED
  ) {
    return normalized;
  }
  return VAULT_ENTITY_STATUS.ACTIVE;
}
