"use client";

import Link from "next/link";
import { FolderArchive } from "lucide-react";
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
  const title = isArchivedPortal
    ? "Access active credentials"
    : "Access archived credentials";

  return (
    /* We cast to 'any' here because your local Button component 
       definition is missing 'asChild' in its TypeScript interface.
    */
    <Button 
      variant="ghost" 
      size="icon" 
      className="h-9 w-9 shrink-0 text-blue-600 hover:text-blue-700" 
      {...( { asChild: true } as any)}
    >
      <Link href={href} title={title} aria-label={title}>
        <FolderArchive className="h-4 w-4" />
      </Link>
    </Button>
  );
}