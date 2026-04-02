"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { parseEnvText, type EnvPair } from "@/lib/env-parser";
import { saveSecretsFromEnv, type SecretImportOutcome } from "@/app/actions/secrets";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectablePair extends EnvPair {
  selected: boolean;
}

type ImportStatus = "idle" | "importing" | "done";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskValue(value: string): string {
  if (value.length === 0) return "(empty)";
  if (value.length <= 4) return "••••";
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 4, 10));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ outcome }: { outcome: SecretImportOutcome }) {
  if (outcome.status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        Saved
      </span>
    );
  }
  if (outcome.status === "pending") {
    return (
      <span
        className="inline-flex max-w-xs items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
        title="Submitted for admin approval"
      >
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1.5l3.5 6.1H2.5L6 1.5z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="M6 5.3v2.2"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <path
            d="M6 9.1h.01"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        Pending approval
      </span>
    );
  }
  return (
    <span
      className="inline-flex max-w-xs items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
      title={outcome.error}
    >
      <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" fill="none">
        <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Failed
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface EnvFileImporterProps {
  projectId: string;
  projectName?: string;
  /** Called after a successful import (e.g. to close a parent dialog). */
  onImportSuccess?: () => void;
}

export default function EnvFileImporter({ projectId, projectName, onImportSuccess }: EnvFileImporterProps) {
  const [rawText,      setRawText]      = useState("");
  const [pairs,        setPairs]        = useState<SelectablePair[]>([]);
  const [outcomes,     setOutcomes]     = useState<SecretImportOutcome[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [globalError,  setGlobalError]  = useState<string | null>(null);
  const [isPending,    startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Live parsing
  // -------------------------------------------------------------------------
  const handleTextChange = useCallback((text: string) => {
    setRawText(text);
    setOutcomes([]);
    setGlobalError(null);
    setImportStatus("idle");
    const { pairs: parsed } = parseEnvText(text);
    setPairs(parsed.map((p) => ({ ...p, selected: true })));
  }, []);

  // -------------------------------------------------------------------------
  // File upload — reads a .env file and populates the textarea
  // -------------------------------------------------------------------------
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        handleTextChange(text);
      };
      reader.readAsText(file);
      e.target.value = ""; // reset so the same file can be re-selected
    },
    [handleTextChange],
  );

  // -------------------------------------------------------------------------
  // Select / deselect helpers
  // -------------------------------------------------------------------------
  const togglePair = useCallback((index: number) => {
    setPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p)),
    );
  }, []);

  const toggleAll = useCallback((selected: boolean) => {
    setPairs((prev) => prev.map((p) => ({ ...p, selected })));
  }, []);

  const selectedPairs = useMemo(() => pairs.filter((p) => p.selected), [pairs]);

  // -------------------------------------------------------------------------
  // Outcome lookup
  // -------------------------------------------------------------------------
  const outcomeMap = useMemo(
    () => new Map(outcomes.map((o) => [o.key, o])),
    [outcomes],
  );

  // -------------------------------------------------------------------------
  // Import handler
  // -------------------------------------------------------------------------
  const handleImport = useCallback(() => {
    if (selectedPairs.length === 0) return;

    setImportStatus("importing");
    setGlobalError(null);

    startTransition(async () => {
      const result = await saveSecretsFromEnv(
        selectedPairs.map(({ key, value }) => ({ key, value })),
        projectId,
      );

      if (!result.success) {
        setGlobalError(result.error);
        setImportStatus("idle");
        return;
      }

      setOutcomes(result.outcomes);
      setImportStatus("done");

      const savedCount = result.outcomes.filter((o) => o.status === "saved").length;
      const pendingCount = result.outcomes.filter((o) => o.status === "pending").length;

      if (savedCount > 0) {
        toast.success(`Saved ${savedCount} secret(s).`);
      }
      if (pendingCount > 0) {
        toast.success(
          `Submitted ${pendingCount} secret(s) for admin approval. They will appear after approval.`,
        );
      }

      if (savedCount > 0 || pendingCount > 0) {
        onImportSuccess?.();
      }
    });
  }, [selectedPairs, projectId, onImportSuccess]);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  const handleReset = useCallback(() => {
    setRawText("");
    setPairs([]);
    setOutcomes([]);
    setGlobalError(null);
    setImportStatus("idle");
  }, []);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const savedCount  = outcomes.filter((o) => o.status === "saved").length;
  const failedCount = outcomes.filter((o) => o.status === "failed").length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="w-full min-w-0 space-y-4">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".env,.txt,text/plain"
        className="hidden"
        onChange={handleFileUpload}
        aria-hidden
      />

      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            Paste contents or upload a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>{" "}
            file{projectName ? <> for <span className="font-medium text-foreground">{projectName}</span></> : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 1v9M4.5 5.5L8 2l3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
          Upload file
        </button>
      </div>

      {/* Textarea — bounded height + horizontal scroll for long lines */}
      <div className="max-h-[min(35vh,11rem)] min-w-0 overflow-auto rounded-lg border border-border bg-muted/30">
        <textarea
          rows={7}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={"# Paste your .env content here\nDATABASE_URL=postgres://user:pass@localhost/db\nSTRIPE_SECRET_KEY=sk_live_..."}
          spellCheck={false}
          className="box-border min-h-[8.75rem] w-full min-w-[min(100%,48rem)] resize-none bg-transparent p-3 font-mono text-sm whitespace-pre text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          disabled={isPending}
        />
      </div>

      {/* No-pairs warning */}
      {rawText.trim().length > 0 && pairs.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
          <span className="font-medium">No KEY=VALUE pairs found.</span>{" "}
          Make sure each line uses the format{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono dark:bg-amber-900/40">KEY=value</code>
          {" "}— comments (#) and blank lines are ignored.
        </div>
      )}

      {/* Parsed preview */}
      {pairs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {pairs.length} key{pairs.length !== 1 ? "s" : ""} parsed
              {selectedPairs.length !== pairs.length && (
                <span className="ml-1 text-muted-foreground">
                  ({selectedPairs.length} selected)
                </span>
              )}
            </p>
            <div className="flex gap-3 text-xs text-primary">
              <button type="button" onClick={() => toggleAll(true)}  className="hover:underline">Select all</button>
              <button type="button" onClick={() => toggleAll(false)} className="hover:underline">Deselect all</button>
            </div>
          </div>

          <div className="max-h-[min(50vh,22rem)] min-w-0 overflow-auto rounded-lg border border-border">
            <table className="w-max min-w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/50 text-xs text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="w-8 py-2 pl-3 pr-1 text-left font-medium"></th>
                  <th className="whitespace-nowrap py-2 pl-2 pr-4 text-left font-medium">Key</th>
                  <th className="whitespace-nowrap py-2 pl-2 pr-4 text-left font-medium">Value (masked)</th>
                  {importStatus === "done" && (
                    <th className="whitespace-nowrap py-2 pl-2 pr-3 text-right font-medium">Status</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pairs.map((pair, idx) => {
                  const outcome = outcomeMap.get(pair.key);
                  return (
                    <tr
                      key={`${pair.key}-${idx}`}
                      className={`transition-colors ${pair.selected ? "bg-background" : "bg-muted/30 opacity-50"}`}
                    >
                      <td className="py-2 pl-3 pr-1">
                        <input
                          type="checkbox"
                          checked={pair.selected}
                          onChange={() => togglePair(idx)}
                          disabled={isPending || importStatus === "done"}
                          className="h-4 w-4 rounded border-border"
                        />
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 pr-4 font-mono font-medium">{pair.key}</td>
                      <td className="whitespace-nowrap py-2 pl-2 pr-4 font-mono text-muted-foreground">{maskValue(pair.value)}</td>
                      {importStatus === "done" && (
                        <td className="py-2 pl-2 pr-3 text-right">
                          {outcome ? <StatusBadge outcome={outcome} /> : null}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Global error */}
      {globalError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {globalError}
        </div>
      )}

      {/* Import summary */}
      {importStatus === "done" && (
        <div className={`rounded-lg border p-3 text-sm ${
          failedCount === 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
        }`}>
          {savedCount > 0  && <span>{savedCount} secret{savedCount !== 1 ? "s" : ""} saved. </span>}
          {failedCount > 0 && <span>{failedCount} failed — hover the Failed badge for details.</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {importStatus !== "done" ? (
          <button
            type="button"
            onClick={handleImport}
            disabled={isPending || selectedPairs.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
              `Import ${selectedPairs.length > 0 ? `${selectedPairs.length} ` : ""}Secret${selectedPairs.length !== 1 ? "s" : ""}`
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Import another file
          </button>
        )}

        {rawText && importStatus !== "done" && (
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
