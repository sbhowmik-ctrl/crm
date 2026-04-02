import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import { getCredentialSectionById } from "@/lib/queries/credentials";
import { VAULT_ENTITY_STATUS } from "@/lib/vault-entity-status";
import { Separator } from "@/components/ui/separator";
import ManageAccessDialog from "@/components/dashboard/ManageAccessDialog";
import CredentialArchiveSectionButton from "@/components/dashboard/CredentialArchiveSectionButton";
import CredentialUnarchiveSectionButton from "@/components/dashboard/CredentialUnarchiveSectionButton";
import AddCredentialKeyForm from "@/components/dashboard/AddCredentialKeyForm";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function CredentialSectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return null;

  const actor = {
    id:       session.user.id,
    role:     session.user.role,
    isActive: session.user.isActive,
  };

  const section = await getCredentialSectionById(id, actor);
  if (!section) notFound();

  const isArchived = section.status === VAULT_ENTITY_STATUS.ARCHIVED;

  const canManageAccess = canUserPerformAction(actor, null, "secret", "update");
  const canAddKeys =
    actor.role !== Role.INTERN &&
    !isArchived &&
    (actor.role === Role.USER ||
      canUserPerformAction(actor, null, "secret", "create"));
  const canArchiveOps = canUserPerformAction(actor, null, "secret", "delete");

  const allUsers =
    canManageAccess && !isArchived
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            role:     { in: [Role.USER, Role.INTERN] },
          },
          select:  { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
        })
      : [];

  const backHref = isArchived
    ? "/dashboard/credentials?status=ARCHIVED"
    : "/dashboard/credentials";
  const backLabel = isArchived ? "Archived credentials" : "Credentials";

  const createdByLabel = section.owner.name ?? section.owner.email ?? "Unknown";
  const updatedByLabel =
    section.updatedBy?.name ??
    section.updatedBy?.email ??
    (section.owner.name ?? section.owner.email ?? "Unknown");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-20">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {backLabel}
        </Link>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[#0c1421]">{section.name}</h1>
              {isArchived && (
                <span className="rounded-md border border-muted-foreground/30 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Archived
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {section.keys.length} key{section.keys.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Created by {createdByLabel} on {formatDate(section.createdAt)}
              </span>
              <span>·</span>
              <span>
                Last modified by {updatedByLabel} on {formatDate(section.updatedAt)}
              </span>
            </div>
            {section.description && (
              <p className="mt-2 max-w-2xl text-sm text-slate-600">{section.description}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canManageAccess && !isArchived && (
              <ManageAccessDialog
                type="credential_section"
                resourceId={section.id}
                resourceName={section.name}
                currentAccess={section.sharedWith}
                allUsers={allUsers}
              />
            )}
            {canArchiveOps && !isArchived && (
              <CredentialArchiveSectionButton sectionId={section.id} sectionName={section.name} />
            )}
            {canArchiveOps && isArchived && (
              <CredentialUnarchiveSectionButton sectionId={section.id} sectionName={section.name} />
            )}
          </div>
        </div>
      </div>

      <Separator />

      {section.sharedWith.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Shared with {section.sharedWith.length} user{section.sharedWith.length !== 1 ? "s" : ""}.
        </p>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#0c1421]">Keys</h2>
        {section.keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <div className="max-h-[min(70vh,36rem)] min-w-0 overflow-auto rounded-xl border border-white/40 bg-white/60 backdrop-blur-md">
            <table className="w-max min-w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-white/90 backdrop-blur-sm">
                <tr className="border-b border-white/30 text-left text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Key</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Owner</th>
                  <th className="whitespace-nowrap px-4 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {section.keys.map((k) => (
                  <tr key={k.id} className="border-t border-white/20">
                    <td className="whitespace-nowrap px-4 py-2 align-top font-semibold text-[#0c1421]">{k.label}</td>
                    <td className="whitespace-nowrap px-4 py-2 align-top text-slate-600">
                      {k.owner.name ?? k.owner.email ?? "—"}
                    </td>
                    <td className="max-w-none px-4 py-2 align-top whitespace-pre-wrap break-all text-slate-700">{k.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canAddKeys && (
        <AddCredentialKeyForm sectionId={section.id} userRole={session.user.role} />
      )}
    </div>
  );
}
