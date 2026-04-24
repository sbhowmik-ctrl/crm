import ProjectSecretsWidget from "@/components/dashboard/ProjectSecretsWidget";
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
import ArchiveNoteButton     from "@/components/dashboard/ArchiveNoteButton";
import DeleteNoteButton      from "@/components/dashboard/DeleteNoteButton";
import CreateSubprojectDialog from "@/components/dashboard/CreateSubprojectDialog";
import LeaveProjectButton    from "@/components/dashboard/LeaveProjectButton";
import EditProjectDialog     from "@/components/dashboard/EditProjectDialog";

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
  const canUpdateProject = canUserPerformAction(actor, null, "project", "update");

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
        select: {
          id:          true,
          name:        true,
          description: true,
          _count:      {
            select: { secrets: true, notes: true, children: true },
          },
        },
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

  // Group secrets by environment
  const groupedSecrets = secrets.reduce((acc, secret) => {
    // If a secret somehow doesn't have an environment, fall back to "Default"
    const env = secret.environment || "Default";
    if (!acc[env]) acc[env] = [];
    acc[env].push(secret);
    return acc;
  }, {} as Record<string, typeof secrets>);

  const backHref = project.parent
    ? `/dashboard/projects/${project.parent.id}`
    : "/dashboard/projects";
  const backLabel = project.parent ? project.parent.name : "Projects";

  return (
    <div className="min-w-0 space-y-8">

      {/* Breadcrumb + header */}
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
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
            <ul className="grid gap-4 sm:grid-cols-2">
              {visibleSubprojects.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/projects/${c.id}`}
                    className="flex min-h-36 flex-col justify-between gap-4 rounded-2xl border border-border bg-card px-6 py-7 shadow-sm transition-colors hover:bg-muted/30 sm:min-h-40"
                  >
                    <div className="min-w-0">
                      <span className="text-lg font-semibold tracking-tight text-foreground">{c.name}</span>
                      {c.description && (
                        <span className="mt-2 block line-clamp-2 text-sm text-muted-foreground">{c.description}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Secrets
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.45)]"
                            aria-hidden
                          />
                          <span className="text-sm font-semibold tabular-nums text-foreground">{c._count.secrets}</span>
                        </div>
                      </div>
                      <div className="w-px self-stretch bg-border/60" aria-hidden />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Notes
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.45)]"
                            aria-hidden
                          />
                          <span className="text-sm font-semibold tabular-nums text-foreground">{c._count.notes}</span>
                        </div>
                      </div>
                      <div className="w-px self-stretch bg-border/60" aria-hidden />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Subprojects
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.45)]"
                            aria-hidden
                          />
                          <span className="text-sm font-semibold tabular-nums text-foreground">{c._count.children}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Secrets section ─────────────────────────────────────────────── */}
      <ProjectSecretsWidget
        project={{ id: project.id, name: project.name }}
        secrets={secrets.map((s) => ({
          id: s.id,
          key: s.key,
          environment: s.environment || "Default",
          ownerName: s.owner.name ?? s.owner.email ?? "Unknown",
          createdAtStr: formatDate(s.createdAt),
        }))}
        showAddSecret={showAddSecret}
        canMutateVault={canMutateVault}
        canUserRequestPendingSubmission={canUserRequestPendingSubmission}
      />

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
                    {canMutateVault && (
                      <DeleteNoteButton noteId={note.id} noteTitle={note.title} />
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