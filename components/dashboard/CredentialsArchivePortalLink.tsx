"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VAULT_ENTITY_STATUS } from "@/lib/vault-entity-status";

interface Props {
  /** When true, the list is the archived portal — link goes back to active. */
  isArchivedPortal: boolean;
}

export default function CredentialsArchivePortalLink({ isArchivedPortal }: Props) {
  const href = isArchivedPortal
    ? "/dashboard/credentials"
    : `/dashboard/credentials?status=${VAULT_ENTITY_STATUS.ARCHIVED}`;

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="shrink-0 border-blue-200 bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
    >
      <Link href={href}>
        {isArchivedPortal ? "← Active Credentials" : "Archived Credentials"}
      </Link>
    </Button>
  );
}
