import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canUserPerformAction } from "@/lib/permissions";
import NoteForm, { type ProjectOption } from "./NoteForm";

interface NoteFormWrapperProps {
  /** Optional callback forwarded to NoteForm after a successful save. */
  onSuccess?: (noteId: string) => void;
}

/**
 * Server Component — fetches the session and the project list, then renders
 * the NoteForm with the correct canEdit flag derived from the user's role.
 *
 * Keeps all Prisma/auth calls server-side so the client bundle stays lean.
 */
export default async function NoteFormWrapper({ onSuccess }: NoteFormWrapperProps) {
  const session = await auth();

  const canEdit = session?.user
    ? canUserPerformAction(
        { id: session.user.id, role: session.user.role },
        null,
        "note",
        "create",
      )
    : false;

  const projects: ProjectOption[] = await prisma.project.findMany({
    select:  { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <NoteForm
      projects={projects}
      canEdit={canEdit}
      onSuccess={onSuccess}
    />
  );
}
