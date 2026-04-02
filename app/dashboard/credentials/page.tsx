import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { canUserPerformAction } from "@/lib/permissions";
import {
  listCredentialSections,
  type CredentialSectionListRow,
} from "@/lib/queries/credentials";
import {
  parseVaultStatusParam,
  VAULT_ENTITY_STATUS,
} from "@/lib/vault-entity-status";
import { Separator } from "@/components/ui/separator";
import { KeyRound } from "lucide-react";
import AddCredentialSectionDialog from "@/components/dashboard/AddCredentialSectionDialog";
import CredentialsArchivePortalLink from "@/components/dashboard/CredentialsArchivePortalLink";
import ManageAccessDialog from "@/components/dashboard/ManageAccessDialog";
import CredentialArchiveSectionButton from "@/components/dashboard/CredentialArchiveSectionButton";
import CredentialUnarchiveSectionButton from "@/components/dashboard/CredentialUnarchiveSectionButton";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const status = parseVaultStatusParam(sp.status);
  if (status === VAULT_ENTITY_STATUS.DELETED) {
    redirect("/dashboard/credentials");
  }

  const isArchivedPortal = status === VAULT_ENTITY_STATUS.ARCHIVED;

  const actor = {
    id:       session.user.id,
    role:     session.user.role,
    isActive: session.user.isActive,
  };

  const sections = await listCredentialSections(
    actor,
    isArchivedPortal ? VAULT_ENTITY_STATUS.ARCHIVED : VAULT_ENTITY_STATUS.ACTIVE,
  );

  const canWriteSection = session.user.role !== Role.INTERN;
  const canManageAccess = canUserPerformAction(actor, null, "secret", "update");
  const canArchiveOps = canUserPerformAction(actor, null, "secret", "delete");

  const allUsers =
    !isArchivedPortal && canManageAccess
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            role:     { in: [Role.USER, Role.INTERN] },
          },
          select:  { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
        })
      : [];

  const pageTitle = isArchivedPortal ? "Archived credentials" : "Credentials";
  const pageDescription = isArchivedPortal
    ? "Sections marked archived. Open the main Credentials list for active work."
    : "Group key-value credentials into sections. Open a section to add keys. Interns are read-only.";

  return (
    <div className="space-y-10 pb-20 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="sticky top-0 z-20 flex flex-col gap-6 bg-transparent px-2 pt-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black uppercase tracking-tight text-[#0c1421] drop-shadow-sm">
            {pageTitle}
          </h1>
          <p className="text-base font-medium tracking-tight text-slate-500">{pageDescription}</p>
        </div>

        <div className="flex items-center gap-4">
          {canWriteSection && !isArchivedPortal && <AddCredentialSectionDialog />}
          <CredentialsArchivePortalLink isArchivedPortal={isArchivedPortal} />
        </div>
      </div>

      <Separator />

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isArchivedPortal ? "No archived sections." : "No credential sections yet."}
        </p>
      ) : (
        <div className="grid gap-6">
          {sections.map((section: CredentialSectionListRow) => {
            const keyCount = section._count.keys;
            const updatedByLabel =
              section.updatedBy?.name ??
              section.updatedBy?.email ??
              (section.owner.name ?? section.owner.email ?? "—");
            return (
              <div
                key={section.id}
                className="group relative flex cursor-pointer flex-col rounded-2xl border border-white/40 bg-white/40 p-6 shadow-sm backdrop-blur-md transition-all hover:bg-white/60 hover:shadow-xl"
              >
                <Link
                  href={`/dashboard/credentials/${section.id}`}
                  className="absolute inset-0 z-[1] rounded-2xl"
                  aria-label={`Open section ${section.name}`}
                />
                <div className="relative z-[2] flex flex-col pointer-events-none">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-[#0c1421] p-2 text-white shadow-lg ring-4 ring-[#0c1421]/5">
                          <KeyRound className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-black uppercase tracking-tight text-[#0c1421]">
                            {section.name}
                          </h2>
                          {section.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                              {section.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            {keyCount} key{keyCount !== 1 ? "s" : ""} added
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="relative z-[3] flex shrink-0 items-center justify-end gap-2 self-start rounded-xl border border-white/40 bg-white/50 p-1.5 shadow-inner backdrop-blur-md pointer-events-auto">
                      {canManageAccess && !isArchivedPortal && (
                        <ManageAccessDialog
                          type="credential_section"
                          resourceId={section.id}
                          resourceName={section.name}
                          currentAccess={section.sharedWith}
                          allUsers={allUsers}
                        />
                      )}
                      {canArchiveOps &&
                        (isArchivedPortal ? (
                          <CredentialUnarchiveSectionButton
                            sectionId={section.id}
                            sectionName={section.name}
                          />
                        ) : (
                          <CredentialArchiveSectionButton
                            sectionId={section.id}
                            sectionName={section.name}
                          />
                        ))}
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-8 border-t border-white/10 pt-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Created
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        <span className="max-w-[14rem] text-[10px] font-black uppercase tracking-wider text-[#0c1421]">
                          {section.owner.name ?? section.owner.email} · {formatDate(section.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Last modified
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.45)]" />
                        <span className="max-w-[14rem] text-[10px] font-black uppercase tracking-wider text-[#0c1421]">
                          {updatedByLabel} · {formatDate(section.updatedAt)}
                        </span>
                      </div>
                    </div>
                    {section.sharedWith.length > 0 && (
                      <>
                        <div className="h-8 w-px bg-white/20" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Shared
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="size-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#0c1421]">
                              {section.sharedWith.length} user{section.sharedWith.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="border-t border-white/20 pt-12">
        <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Credential Vault
        </p>
      </footer>
    </div>
  );
}
