/**
 * Access-controlled queries for credential sections (mirrors general notes scope).
 */

import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  credentialSectionWhereForVaultRead,
  VAULT_ENTITY_STATUS,
} from "@/lib/vault-entity-status";
import {
  allowedAccessWhere,
  hasUnrestrictedProjectScope,
  isActorContentBlocked,
  type QueryActor,
} from "./access";

// ---------------------------------------------------------------------------
// Select shapes
// ---------------------------------------------------------------------------

export const CREDENTIAL_SECTION_DETAIL_SELECT = {
  id:          true,
  name:        true,
  description: true,
  status:      true,
  ownerId:    true,
  createdAt:  true,
  updatedAt:  true,
  owner:      { select: { id: true, name: true, email: true } },
  updatedBy:  { select: { id: true, name: true, email: true } },
  sharedWith: { select: { id: true, name: true, email: true } },
  keys:       {
    orderBy: { createdAt: "asc" as const },
    select:  {
      id:        true,
      label:     true,
      value:     true,
      createdAt: true,
      owner:     { select: { id: true, name: true, email: true } },
    },
  },
} as const;

const CREDENTIAL_LIST_SELECT = {
  id:          true,
  name:        true,
  description: true,
  status:      true,
  createdAt:   true,
  updatedAt:   true,
  owner:       { select: { id: true, name: true, email: true } },
  updatedBy:   { select: { id: true, name: true, email: true } },
  sharedWith:  { select: { id: true, name: true, email: true } },
  _count:      { select: { keys: true } },
} as const;

export type CredentialSectionListRow = Awaited<
  ReturnType<typeof listCredentialSections>
>[number];

export type CredentialSectionDetail = NonNullable<
  Awaited<ReturnType<typeof getCredentialSectionById>>
>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Exclude soft-deleted rows when reading by id. */
const excludeDeleted = { status: { not: VAULT_ENTITY_STATUS.DELETED } };

/**
 * Sections the actor may see in the active or archived portal list.
 */
export async function listCredentialSections(
  actor: QueryActor,
  status: typeof VAULT_ENTITY_STATUS.ACTIVE | typeof VAULT_ENTITY_STATUS.ARCHIVED,
) {
  if (isActorContentBlocked(actor)) return [];

  const statusWhere = { status };

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.credentialSection.findMany({
      where:   statusWhere,
      select:  CREDENTIAL_LIST_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  if (actor.role === Role.MODERATOR) {
    return prisma.credentialSection.findMany({
      where:   statusWhere,
      select:  CREDENTIAL_LIST_SELECT,
      orderBy: { createdAt: "asc" },
    });
  }

  return prisma.credentialSection.findMany({
    where: {
      AND: [statusWhere, allowedAccessWhere(actor)],
    },
    select:  CREDENTIAL_LIST_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Single section for detail page. Returns `null` if missing or inaccessible.
 */
export async function getCredentialSectionById(id: string, actor: QueryActor) {
  if (isActorContentBlocked(actor)) return null;

  const sectionRead = credentialSectionWhereForVaultRead(actor);

  if (hasUnrestrictedProjectScope(actor.role)) {
    return prisma.credentialSection.findFirst({
      where: {
        AND: [{ id }, sectionRead, excludeDeleted],
      },
      select: CREDENTIAL_SECTION_DETAIL_SELECT,
    });
  }

  if (actor.role === Role.MODERATOR) {
    return prisma.credentialSection.findFirst({
      where: {
        AND: [{ id }, sectionRead, excludeDeleted],
      },
      select: CREDENTIAL_SECTION_DETAIL_SELECT,
    });
  }

  return prisma.credentialSection.findFirst({
    where: {
      AND: [
        { id },
        sectionRead,
        excludeDeleted,
        allowedAccessWhere(actor),
      ],
    },
    select: CREDENTIAL_SECTION_DETAIL_SELECT,
  });
}
