import Link       from "next/link";
import { notFound } from "next/navigation";
import { Role }   from "@prisma/client";
import { auth }     from "@/auth";
import { prisma }   from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import { getVaultProjectIdsForActor, hasUnrestrictedProjectScope } from "@/lib/queries/access";
import {
  projectWhereForVaultRead,
  VAULT_ENTITY_STATUS,
} from "@/lib/vault-entity-status";
import { getSecretsByProject }  from "@/lib/queries/secrets";
import { getNotesByProject }    from "@/lib/queries/notes";
import { Separator }         from "@/components/ui/separator";
import CopyButton            from "@/components/CopyButton";
import RevealButton          from "@/components/RevealButton";
import CopyAllSecretsButton  from "@/components/CopyAllSecretsButton";
import AddSecretDialog       from "@/components/dashboard/AddSecretDialog";
import EditSecretDialog      from "@/components/dashboard/EditSecretDialog";
import DeleteSecretButton    from "@/components/dashboard/DeleteSecretButton";
import ManageAccessDialog    from "@/components/dashboard/ManageAccessDialog";
import CopyNoteButton        from "@/components/CopyNoteButton";
import ReactMarkdown         from "react-markdown";
import AddNoteDialog         from "@/components/dashboard/AddNoteDialog";
import EditNoteDialog        from "@/components/dashboard/EditNoteDialog";
import ArchiveNoteButton      from "@/components/dashboard/ArchiveNoteButton";
import CreateSubprojectDialog from "@/components/dashboard/CreateSubprojectDialog";
import LeaveProjectButton   from "@/components/dashboard/LeaveProjectButton";
import EditProjectDialog    from "@/components/dashboard/EditProjectDialog"; // <-- ADDED IMPORT

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProjectDetailPage({
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
  const canCreateProject = canUserPerformAction(actor, null, "project", "create");
  const canUpdateProject = canUserPerformAction(actor, null, "project", "update"); // <-- ADDED PERMISSION CHECK

  const project = await prisma.project.findFirst({
    where: { id, ...projectWhereForVaultRead(actor) },
    select: {
      id:          true,
      name:        true,
      description: true,
      status:      true,
      createdAt:   true,
      updatedAt:   true,
      owner:      { select: { id: true, name: true, email: true } },
      createdBy:   { select: { id: true, name: true, email: true } },
      updatedBy:   { select: { id: true, name: true, email: true } },
      parentId:    true,
      parent:      { select: { id: true, name: true } },
      children:    {
        select:  { id: true, name: true, description: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!project) notFound();

  const isArchivedProject = project.status === VAULT_ENTITY_STATUS.ARCHIVED;

  const projectMembership = await prisma.projectMember.findFirst({
    where: { userId: actor.id, projectId: id },
    select: { id: true },
  });

  const vaultScope = hasUnrestrictedProjectScope(actor.role)
    ? null
    : actor.role === Role.MODERATOR ||
        actor.role === Role.USER ||
        actor.role === Role.INTERN
      ? await getVaultProjectIdsForActor(actor)
      : null;

  if (actor.role === Role.MODERATOR && vaultScope && !vaultScope.includes(id)) {
    notFound();
  }

  if (
    (actor.role === Role.USER || actor.role === Role.INTERN) &&
    vaultScope &&
    !vaultScope.includes(id)
  ) {
    notFound();
  }

  const visibleSubprojects =
    actor.role === Role.USER || actor.role === Role.INTERN
      ? vaultScope
        ? project.children.filter((c) => vaultScope.includes(c.id))
        : []
      : project.children;

  const canModeratorPlusVault =
    canUserPerformAction(actor, null, "secret", "create") &&
    (hasUnrestrictedProjectScope(actor.role) ||
      (actor.role === Role.MODERATOR && vaultScope !== null && vaultScope.includes(id)) ||
      !!projectMembership);

  /** Archived projects stay readable; mutations are disabled. */
  const canMutateVault = canModeratorPlusVault && !isArchivedProject;
  
  /** Determine if the user has permission to edit THIS specific project. */
  const canEditProject = 
    canUpdateProject && 
    !isArchivedProject && 
    (hasUnrestrictedProjectScope(actor.role) || 
      (actor.role === Role.MODERATOR && vaultScope !== null && vaultScope.includes(id)));

  /** USER may request new secrets/notes for admin approval (not interns). */
  const canUserRequestPendingSubmission =
    actor.role === Role.USER && !!projectMembership && !isArchivedProject;

  const showAddSecret = canMutateVault || canUserRequestPendingSubmission;
  const showAddProjectNote = canMutateVault || canUserRequestPendingSubmission;

  const canLeaveProject =
    !!projectMembership &&
    (actor.role === Role.USER ||
      actor.role === Role.INTERN ||
      actor.role === Role.MODERATOR);

  const ADMIN_ASSIGN_ROLES = new Set<Role>([Role.ADMIN, Role.SUPERADMIN]);
  const canManageProjectAssignments =
    ADMIN_ASSIGN_ROLES.has(actor.role) && !isArchivedProject;

  const projectMembersForAssign = canManageProjectAssignments
    ? await prisma.projectMember.findMany({
        where: { projectId: id },
        select: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      })
    : [];

  const currentProjectAssignees = projectMembersForAssign.map((m) => ({
    id:    m.user.id,
    name:  m.user.name,
    email: m.user.email,
  }));

  const [secrets, notes, allUsers] = await Promise.all([
    getSecretsByProject(id, actor),
    getNotesByProject(id, actor),
    prisma.user.findMany({
      where:   { isActive: true },
      select:  { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const createdByLabel =
    project.createdBy?.name ??
    project.createdBy?.email ??
    project.owner?.name ??
    project.owner?.email ??
    null;

  const updatedByLabel =
    project.updatedBy?.name ??
    project.updatedBy?.email ??
    createdByLabel;

  return (
    <div className="min-w-0 space-y-8">

      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Projects
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              {/* <-- ADDED EDIT BUTTON HERE --> */}
              {canEditProject && (
                <EditProjectDialog
                  project={{
                    id: project.id,
                    name: project.name,
                    description: project.description,
                  }}
                />
              )}
              {isArchivedProject && (
                <span className="rounded-md border border-muted-foreground/30 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Archived
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Created on {formatDate(project.createdAt)}
                {createdByLabel && <> by {createdByLabel}</>}
              </span>
              <span>·</span>
              <span>
                Last modified on {formatDate(project.updatedAt)}
                {updatedByLabel && <> by {updatedByLabel}</>}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageProjectAssignments && (
              <ManageAccessDialog
                type="project"
                resourceId={id}
                resourceName={project.name}
                currentAccess={currentProjectAssignees}
                allUsers={allUsers}
                triggerLabel="Assign to"
              />
            )}
            {canLeaveProject && (
              <LeaveProjectButton projectId={id} projectName={project.name} />
            )}
          </div>
        </div>
        {project.parent && (
          <p className="mt-1 text-sm text-muted-foreground">
            Subproject of{" "}
            <Link
              href={`/dashboard/projects/${project.parent.id}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {project.parent.name}
            </Link>
          </p>
        )}
        {project.description && (
          <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
        )}
      </div>

      {/* ── Subprojects ─────────────────────────────────────────────────── */}
      {(visibleSubprojects.length > 0 || (canCreateProject && !isArchivedProject)) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Subprojects</h2>
              <p className="text-xs text-muted-foreground">
                {visibleSubprojects.length} subproject{visibleSubprojects.length !== 1 ? "s" : ""} under this project
              </p>
            </div>
            {canCreateProject && !isArchivedProject && (
              <CreateSubprojectDialog parentId={project.id} parentName={project.name} />
            )}
          </div>

          {visibleSubprojects.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {canCreateProject
                  ? "No subprojects yet. Create one to organize secrets and membership by area."
                  : "No subprojects."}
              </p>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {visibleSubprojects.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/projects/${c.id}`}
                    className="block rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm transition-colors hover:bg-muted/30"
                  >
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.description && (
                      <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{c.description}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Secrets section ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Secrets</h2>
            <p className="text-xs text-muted-foreground">
              {secrets.length} encrypted secret{secrets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CopyAllSecretsButton projectId={project.id} secretCount={secrets.length} />
            {showAddSecret && (
              <AddSecretDialog
                projectId={project.id}
                projectName={project.name}
                allowBulkImport={canMutateVault || canUserRequestPendingSubmission}
              />
            )}
          </div>
        </div>

        {secrets.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No secrets yet.{showAddSecret ? " Add one above." : ""}
            </p>
          </div>
        ) : (
          <div className="max-h-[min(70vh,40rem)] min-w-0 overflow-auto rounded-xl border border-border">
            <table className="w-max min-w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur-sm">
                <tr className="text-xs text-muted-foreground">
                  <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">Key</th>
                  <th className="whitespace-nowrap py-2.5 px-3 text-left font-medium">Owner</th>
                  <th className="whitespace-nowrap py-2.5 px-3 text-left font-medium">Created</th>
                  <th className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {secrets.map((s) => (
                  <tr key={s.id} className="bg-card hover:bg-muted/20 transition-colors">
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono font-medium whitespace-nowrap">{s.key}</span>
                        <span className="font-mono text-xs text-muted-foreground tracking-widest select-none">
                          ••••••••
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 px-3 text-muted-foreground">
                      {s.owner.name ?? s.owner.email}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <RevealButton secretId={s.id} secretKey={s.key} />
                        <CopyButton secretId={s.id} />
                        {canMutateVault && (
                          <EditSecretDialog secretId={s.id} secretKey={s.key} />
                        )}
                        {canMutateVault && (
                          <DeleteSecretButton secretId={s.id} secretKey={s.key} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* ── Notes section ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Notes</h2>
            <p className="text-xs text-muted-foreground">
              {notes.length} note{notes.length !== 1 ? "s" : ""} linked to this project
            </p>
          </div>
          {showAddProjectNote && (
            <AddNoteDialog projectId={project.id} projectName={project.name} />
          )}
        </div>

        {notes.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No notes yet.{showAddProjectNote ? " Add one above." : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">
                      <Link
                        href={`/dashboard/notes/${note.id}`}
                        className="hover:underline underline-offset-2"
                      >
                        {note.title}
                      </Link>
                    </h3>
                    <div className="mt-2 prose prose-sm max-w-none text-muted-foreground">
                      <ReactMarkdown>{note.content}</ReactMarkdown>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* Copy — available to all roles */}
                    <CopyNoteButton title={note.title} content={note.content} />

                    {/* Edit, manage access, delete — MODERATOR and above only */}
                    {canMutateVault && (
                      <EditNoteDialog
                        noteId={note.id}
                        initialTitle={note.title}
                        initialContent={note.content}
                      />
                    )}
                    {canMutateVault && (
                      <ManageAccessDialog
                        type="note"
                        resourceId={note.id}
                        resourceName={note.title}
                        currentAccess={note.sharedWith}
                        allUsers={allUsers}
                      />
                    )}
                    {canMutateVault && (
                      <ArchiveNoteButton noteId={note.id} noteTitle={note.title} />
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>By {note.owner.name ?? note.owner.email}</span>
                  <span>·</span>
                  <span>{formatDate(note.updatedAt)}</span>
                  {note.sharedWith.length > 0 && (
                    <>
                      <span>·</span>
                      <span>Shared with {note.sharedWith.length}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}