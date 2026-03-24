"use client";

import {
  type FormEvent,
  useCallback,
  useState,
  useTransition,
} from "react";
import { NoteType } from "@prisma/client";
import { saveNote } from "@/app/actions/notes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectOption {
  id:   string;
  name: string;
}

interface NoteFormProps {
  /** List of projects the user can link a note to. */
  projects:  ProjectOption[];
  /**
   * Whether the current user may create / submit the form.
   * When false the form renders in read-only mode with an access banner.
   */
  canEdit:   boolean;
  /** Optional callback invoked with the new note ID after a successful save. */
  onSuccess?: (noteId: string) => void;
}

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

function ReadOnlyBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5zM8 11a.875.875 0 110 1.75A.875.875 0 018 11z" />
      </svg>
      <p className="text-sm text-amber-800">
        <span className="font-medium">View-only access.</span> Your role only permits reading notes.
        Contact an Admin or Moderator to make changes.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NoteForm({ projects, canEdit, onSuccess }: NoteFormProps) {
  // ── Form state ────────────────────────────────────────────────────────────
  const [title,     setTitle]     = useState("");
  const [content,   setContent]   = useState("");
  const [noteType,  setNoteType]  = useState<NoteType>(NoteType.NORMAL);
  const [projectId, setProjectId] = useState("");

  // ── Submission state ──────────────────────────────────────────────────────
  const [isPending,  startTransition] = useTransition();
  const [globalError,  setGlobalError]  = useState<string | null>(null);
  const [fieldErrors,  setFieldErrors]  = useState<Record<string, string>>({});
  const [savedNoteId,  setSavedNoteId]  = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setTitle("");
    setContent("");
    setNoteType(NoteType.NORMAL);
    setProjectId("");
    setGlobalError(null);
    setFieldErrors({});
    setSavedNoteId(null);
  }, []);

  const handleTypeToggle = useCallback((type: NoteType) => {
    setNoteType(type);
    if (type === NoteType.NORMAL) setProjectId("");
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.projectId;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canEdit) return;

      setGlobalError(null);
      setFieldErrors({});

      startTransition(async () => {
        const result = await saveNote({
          title,
          content,
          type: noteType,
          projectId: noteType === NoteType.PROJECT_BASED ? projectId : undefined,
        });

        if (!result.success) {
          setGlobalError(result.error);
          if (result.fieldErrors) setFieldErrors(result.fieldErrors);
          return;
        }

        setSavedNoteId(result.data.id);
        onSuccess?.(result.data.id);
      });
    },
    [canEdit, title, content, noteType, projectId, onSuccess],
  );

  const disabled = !canEdit || isPending;

  // ── Success screen ────────────────────────────────────────────────────────
  if (savedNoteId) {
    return (
      <div className="w-full max-w-2xl space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">Note created</p>
            <p className="mt-0.5 text-sm text-neutral-500">ID: <code className="rounded bg-neutral-100 px-1 text-xs">{savedNoteId}</code></p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2"
          >
            Create another note
          </button>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl space-y-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">
          {canEdit ? "New Note" : "Note"}
        </h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          {canEdit
            ? "Create a general note or link it to a specific project."
            : "Viewing note details."}
        </p>
      </div>

      {/* Read-only banner */}
      {!canEdit && <ReadOnlyBanner />}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>

        {/* Title */}
        <div>
          <label htmlFor="note-title" className="block text-sm font-medium text-neutral-700">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="note-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. API Integration Notes"
            disabled={disabled}
            className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm text-neutral-800 shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400 ${
              fieldErrors.title
                ? "border-red-400 focus:border-red-400"
                : "border-neutral-300 focus:border-blue-500"
            }`}
          />
          <FieldError message={fieldErrors.title} />
        </div>

        {/* Note type toggle */}
        <div>
          <span className="block text-sm font-medium text-neutral-700">Note type</span>
          <div className="mt-2 inline-flex rounded-lg border border-neutral-300 bg-neutral-50 p-0.5">
            {(
              [
                { value: NoteType.NORMAL,       label: "General"       },
                { value: NoteType.PROJECT_BASED, label: "Project-based" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => handleTypeToggle(value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed ${
                  noteType === value
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Project selector — only shown for PROJECT_BASED */}
        {noteType === NoteType.PROJECT_BASED && (
          <div>
            <label htmlFor="note-project" className="block text-sm font-medium text-neutral-700">
              Project <span className="text-red-500">*</span>
            </label>

            {projects.length === 0 ? (
              <p className="mt-1.5 text-sm text-amber-600">
                No projects available. Ask an Admin to create one first.
              </p>
            ) : (
              <select
                id="note-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={disabled}
                className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm text-neutral-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400 ${
                  fieldErrors.projectId
                    ? "border-red-400 focus:border-red-400"
                    : "border-neutral-300 focus:border-blue-500"
                }`}
              >
                <option value="" disabled>Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <FieldError message={fieldErrors.projectId} />
          </div>
        )}

        {/* Content */}
        <div>
          <label htmlFor="note-content" className="block text-sm font-medium text-neutral-700">
            Content <span className="text-red-500">*</span>
          </label>
          <textarea
            id="note-content"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note here…"
            disabled={disabled}
            className={`mt-1.5 block w-full resize-y rounded-lg border px-3 py-2 text-sm text-neutral-800 shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400 ${
              fieldErrors.content
                ? "border-red-400 focus:border-red-400"
                : "border-neutral-300 focus:border-blue-500"
            }`}
          />
          <FieldError message={fieldErrors.content} />
        </div>

        {/* Global error */}
        {globalError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {globalError}
          </div>
        )}

        {/* Submit */}
        {canEdit && (
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={resetForm}
              disabled={isPending}
              className="text-sm text-neutral-400 hover:text-neutral-600 disabled:cursor-not-allowed"
            >
              Clear
            </button>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  Create Note
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
