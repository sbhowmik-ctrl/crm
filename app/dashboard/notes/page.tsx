import Link from "next/link";
import { redirect } from "next/navigation";
import { NoteType, Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import {
  getAccessibleNotesByStatus,
  getGeneralNotes,
} from "@/lib/queries/notes";
import {
  parseVaultStatusParam,
  VAULT_ENTITY_STATUS,
} from "@/lib/vault-entity-status";
import { FileText, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import CopyNoteButton from "@/components/CopyNoteButton";
import AddNoteDialog from "@/components/dashboard/AddNoteDialog";
import EditNoteDialog from "@/components/dashboard/EditNoteDialog";
import ArchiveNoteButton from "@/components/dashboard/ArchiveNoteButton";
import DeleteNoteButton from "@/components/dashboard/DeleteNoteButton";
import UnarchiveNoteButton from "@/components/dashboard/UnarchiveNoteButton";
import ManageAccessDialog from "@/components/dashboard/ManageAccessDialog";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFirstImageSrc(content: string): string | undefined {
  if (!content) return undefined;
  // Avoid RegExp on huge data-URL bodies — it can overflow the engine stack.
  const prefix = "![](data:image";
  const i = content.indexOf(prefix);
  if (i === -1) return undefined;
  const urlStart = i + 4;
  const close = content.indexOf(")", urlStart);
  if (close === -1) return undefined;
  return content.slice(urlStart, close);
}

function getNotePreview(content: string): string {
  if (!content) return "";
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const trimmed = firstLine.trim();
  if (!trimmed) return "";
  // If the first line is just an image markdown, show a simple label instead of the long data URL.
  if (trimmed.startsWith("![")) return "[image]";
  const max = 80;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const sp = await searchParams;
  const status = parseVaultStatusParam(sp.status);
  const query = sp.q?.trim() ?? "";
  if (status === VAULT_ENTITY_STATUS.DELETED) {
    redirect("/dashboard/notes");
  }

  const isArchivedList = status === VAULT_ENTITY_STATUS.ARCHIVED;

  const actor = {
    id:       session.user.id,
    role:     session.user.role,
    isActive: session.user.isActive,
  };
  const canEdit = canUserPerformAction(actor, null, "note", "create");
  const canUnarchive = canUserPerformAction(actor, null, "note", "delete");
  const showAddNote =
    !isArchivedList && (canEdit || actor.role === Role.USER);

  let notes = isArchivedList
    ? await getAccessibleNotesByStatus(actor, VAULT_ENTITY_STATUS.ARCHIVED)
    : await getGeneralNotes(actor);

  const qLower = query.toLowerCase();
  if (qLower) {
    notes = notes.filter((note) => {
      const title = note.title.toLowerCase();
      const content = note.content.toLowerCase();
      const owner =
        (note.owner.name ?? note.owner.email ?? "").toLowerCase();
      return (
        title.includes(qLower) ||
        content.includes(qLower) ||
        owner.includes(qLower)
      );
    });
  }

  const pageTitle = isArchivedList ? "Archived notes" : "General Notes";
  const pageDescription = isArchivedList
    ? "Open a note to read its contents."
    : "Notes not tied to a specific project.";

  const allUsers = !isArchivedList
    ? await prisma.user.findMany({
        where: {
          isActive: true,
          // Superadmins / Admins / Moderators implicitly see all general notes;
          // access management UI should only list USER / INTERN as share targets.
          role: { in: [Role.USER, Role.INTERN] },
        },
        select:  { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-10 pb-20 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 relative">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-transparent pt-4 px-2 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tight text-[#0c1421] drop-shadow-sm uppercase">
              {pageTitle}
            </h1>
            <p className="text-base text-slate-500 font-medium tracking-tight">
              {pageDescription}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {showAddNote && <AddNoteDialog />}
            <Button
              asChild
              variant="default"
              size="sm"
              className="bg-blue-600 font-black uppercase tracking-widest text-[9px] text-white hover:bg-blue-700"
            >
              <Link
                href={
                  isArchivedList
                    ? "/dashboard/notes"
                    : `/dashboard/notes?status=${VAULT_ENTITY_STATUS.ARCHIVED}`
                }
              >
                {isArchivedList ? "Access Primary Notes" : "Access Archived Notes"}
              </Link>
            </Button>
          </div>
        </div>

        {/* Search */}
        <form
          method="GET"
          className="w-full max-w-md"
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search notes by title, content, or owner..."
            className="w-full h-10 rounded-xl border border-white/40 bg-white/60 px-3 text-sm font-medium text-[#0c1421] placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {isArchivedList && (
            <input type="hidden" name="status" value={VAULT_ENTITY_STATUS.ARCHIVED} />
          )}
        </form>
      </div>

      {notes.length === 0 ? (
        <div className="bg-white/30 backdrop-blur-md rounded-[2.5rem] border border-white/40 p-24 text-center space-y-4 animate-in fade-in zoom-in duration-700">
          <div className="size-16 bg-slate-100 rounded-2xl mx-auto flex items-center justify-center text-slate-400">
            <FileText className="size-8" />
          </div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
            {isArchivedList
              ? "Archival repository is currently empty."
              : `No data entries in the general directory.`}
          </p>
        </div>
      ) : isArchivedList ? (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <li key={note.id} className="group">
              <div className="flex flex-col h-full bg-white/30 backdrop-blur-md border border-white/40 p-8 rounded-[2rem] shadow-sm transition-all hover:bg-white/50 hover:shadow-2xl">
                <Link
                  href={`/dashboard/notes/${note.id}`}
                  className="flex-1 flex flex-col"
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      Archival Log
                    </span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {formatDate(note.updatedAt)}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-[#0c1421] truncate uppercase tracking-tight mb-2">
                    {note.title}
                  </h3>
                  <div className="mt-auto pt-4 border-t border-white/10 flex items-center justify-between">
                    {note.type === NoteType.NORMAL ? (
                      <div className="px-2.5 py-0.5 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        General
                      </div>
                    ) : (
                      <div className="px-2.5 py-0.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {note.project?.name ?? "Project"}
                      </div>
                    )}
                    <ChevronRight className="size-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
                {canUnarchive && (
                  <div className="mt-4 flex justify-end gap-2">
                    <UnarchiveNoteButton noteId={note.id} noteTitle={note.title} />
                    {note.type !== NoteType.NORMAL && (
                      <DeleteNoteButton noteId={note.id} noteTitle={note.title} />
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-6">
          {notes.map((note) => {
            const preview = getNotePreview(note.content);
            const imageSrc = getFirstImageSrc(note.content);
            return (
              <div
                key={note.id}
                className="group relative flex cursor-pointer flex-col bg-white/40 backdrop-blur-md border border-white/40 p-6 rounded-2xl shadow-sm transition-all hover:bg-white/60 hover:shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500"
              >
                <Link
                  href={`/dashboard/notes/${note.id}`}
                  className="absolute inset-0 z-[1] rounded-2xl"
                  aria-label={`Open note ${note.title}`}
                />
                <div className="relative z-[2] flex flex-col pointer-events-none">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="p-2 bg-[#0c1421] text-white rounded-xl shadow-lg ring-4 ring-[#0c1421]/5">
                          <FileText className="size-4" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-black text-[#0c1421] tracking-tight uppercase leading-none">
                              {note.title}
                            </h3>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              {formatDate(note.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      {preview && !imageSrc && (
                        <div className="relative pl-4 border-l-2 border-blue-500/20 py-1 text-sm text-slate-600 truncate">
                          {preview}
                        </div>
                      )}
                      {imageSrc && (
                        <div className="mt-2 pl-4">
                          <img
                            src={imageSrc}
                            alt="Note image"
                            className="max-h-20 w-auto rounded-md border border-slate-200 object-cover shadow-sm"
                          />
                        </div>
                      )}
                    </div>

                    <div className="relative z-[3] flex shrink-0 items-center justify-end gap-2 lg:self-start bg-white/50 backdrop-blur-md p-1.5 rounded-xl border border-white/40 shadow-inner pointer-events-auto">
                      <CopyNoteButton title={note.title} content={note.content} />

                      {canEdit && (
                        <EditNoteDialog
                          noteId={note.id}
                          initialTitle={note.title}
                          initialContent={note.content}
                        />
                      )}
                      {canEdit && (
                        <ManageAccessDialog
                          type="note"
                          resourceId={note.id}
                          resourceName={note.title}
                          currentAccess={note.sharedWith}
                          allUsers={allUsers}
                        />
                      )}
                      {canEdit && (
                        <ArchiveNoteButton noteId={note.id} noteTitle={note.title} />
                      )}
                    </div>
                  </div>

                  <div className="mt-10 pt-8 border-t border-white/10 flex flex-wrap items-center gap-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        Origin User
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="size-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        <span className="text-[10px] font-black text-[#0c1421] uppercase tracking-wider">
                          {note.owner.name ?? note.owner.email}
                        </span>
                      </div>
                    </div>

                    {note.sharedWith.length > 0 && (
                      <>
                        <div className="w-px h-8 bg-white/20" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Shared Nodes
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="size-1.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                            <span className="text-[10px] font-black text-[#0c1421] uppercase tracking-wider">
                              {note.sharedWith.length} Active Node
                              {note.sharedWith.length !== 1 ? "s" : ""}
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
      
      <footer className="pt-24 border-t border-white/20">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">
          Credential Vault
        </p>
      </footer>
    </div>
  );
}
