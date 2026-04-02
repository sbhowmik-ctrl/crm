import Link from "next/link";
import { notFound } from "next/navigation";
import { NoteType } from "@prisma/client";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { auth } from "@/auth";
import { getNoteById } from "@/lib/queries/notes";
import { VAULT_ENTITY_STATUS } from "@/lib/vault-entity-status";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import CopyNoteButton from "@/components/CopyNoteButton";
import EditNoteDialog  from "@/components/dashboard/EditNoteDialog";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function NoteDetailPage({
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

  const note = await getNoteById(id, actor);
  if (!note) notFound();

  const isArchived = note.status === VAULT_ENTITY_STATUS.ARCHIVED;

  const createdByLabel = note.owner.name ?? note.owner.email ?? null;
  const updatedByLabel =
    note.updatedBy?.name ??
    note.updatedBy?.email ??
    (note.owner.name ?? note.owner.email ?? null);

  const backHref =
    isArchived ? "/dashboard/notes?status=ARCHIVED" : "/dashboard/notes";
  const backLabel = isArchived ? "Archived notes" : "General notes";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
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

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{note.title}</h1>
            {isArchived && (
              <span className="rounded-md border border-muted-foreground/30 bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Archived
              </span>
            )}
            {note.type === NoteType.NORMAL ? (
              <Badge variant="outline" className="text-[10px]">
                General
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                {note.project ? (
                  <Link
                    href={`/dashboard/projects/${note.project.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {note.project.name}
                  </Link>
                ) : (
                  "Project"
                )}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Created on {formatDate(note.createdAt)}
              {createdByLabel && <> by {createdByLabel}</>}
            </span>
            <span>·</span>
            <span>
              Last modified on {formatDate(note.updatedAt)}
              {updatedByLabel && <> by {updatedByLabel}</>}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-6">
          <div className="prose prose-sm max-w-none text-foreground">
            <ReactMarkdown
              urlTransform={(url) =>
                url.startsWith("data:") ? url : defaultUrlTransform(url)
              }
              components={{
                img({ src, alt }) {
                  if (!src) return null;
                  return (
                    <figure className="my-4 flex flex-col items-start gap-1">
                      <a
                        // If 'src' is definitely a string or Blob, convert it:
                        href={typeof src === 'string' ? src : URL.createObjectURL(src)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Open image in new tab
                      </a>
                      <img
                        src={src}
                        alt={alt ?? "Note image"}
                        className="max-h-64 w-auto rounded-lg border border-border object-contain shadow-sm"
                      />
                    </figure>
                  );
                },
              }}
            >
              {note.content}
            </ReactMarkdown>
          </div>

          {note.sharedWith.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Shared with {note.sharedWith.length} user
                {note.sharedWith.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!isArchived ? (
            <EditNoteDialog
              noteId={note.id}
              initialTitle={note.title}
              initialContent={note.content}
            />
          ) : null}
          <CopyNoteButton title={note.title} content={note.content} />
        </div>
      </div>

    </div>
  );
}
