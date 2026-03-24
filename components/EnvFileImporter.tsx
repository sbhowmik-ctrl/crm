"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { parseEnvText, type EnvPair } from "@/lib/env-parser";
import { saveSecretsFromEnv, type SecretImportOutcome } from "@/app/actions/secrets";

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

/** Masks a secret value so it is never fully visible in the UI. */
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
}

export default function EnvFileImporter({ projectId, projectName }: EnvFileImporterProps) {
  const [rawText, setRawText]       = useState("");
  const [pairs, setPairs]           = useState<SelectablePair[]>([]);
  const [outcomes, setOutcomes]     = useState<SecretImportOutcome[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [globalError, setGlobalError]   = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();

  // -------------------------------------------------------------------------
  // Live parsing — re-runs every time the textarea changes
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

  const selectedPairs = useMemo(
    () => pairs.filter((p) => p.selected),
    [pairs],
  );

  // -------------------------------------------------------------------------
  // Outcome lookup — used to show per-row status after import
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
    });
  }, [selectedPairs, projectId]);

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
    <div className="w-full max-w-3xl space-y-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Import .env File</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Paste your <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">.env</code>{" "}
          contents. Each key-value pair will be encrypted and saved
          {projectName ? <> to <span className="font-medium text-neutral-700">{projectName}</span></> : ""}.
        </p>
      </div>

      {/* Textarea */}
      <div className="space-y-1.5">
        <label htmlFor="env-input" className="block text-sm font-medium text-neutral-700">
          Raw .env content
        </label>
        <textarea
          id="env-input"
          rows={8}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={"# Paste your .env content here\nDATABASE_URL=postgres://user:pass@localhost/db\nSTRIPE_SECRET_KEY=sk_live_..."}
          spellCheck={false}
          className="w-full resize-y rounded-lg border border-neutral-300 bg-neutral-50 p-3 font-mono text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          disabled={isPending}
        />
      </div>

      {/* Parsed preview */}
      {pairs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-700">
              {pairs.length} key{pairs.length !== 1 ? "s" : ""} parsed
              {selectedPairs.length !== pairs.length && (
                <span className="ml-1 text-neutral-400">
                  ({selectedPairs.length} selected)
                </span>
              )}
            </p>
            <div className="flex gap-3 text-xs text-blue-600">
              <button type="button" onClick={() => toggleAll(true)}  className="hover:underline">Select all</button>
              <button type="button" onClick={() => toggleAll(false)} className="hover:underline">Deselect all</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="w-8 py-2 pl-3 pr-1 text-left font-medium"></th>
                  <th className="py-2 pl-2 pr-4 text-left font-medium">Key</th>
                  <th className="py-2 pl-2 pr-4 text-left font-medium">Value (masked)</th>
                  {importStatus === "done" && (
                    <th className="py-2 pl-2 pr-3 text-right font-medium">Status</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pairs.map((pair, idx) => {
                  const outcome = outcomeMap.get(pair.key);
                  return (
                    <tr
                      key={`${pair.key}-${idx}`}
                      className={`transition-colors ${pair.selected ? "bg-white" : "bg-neutral-50 opacity-50"}`}
                    >
                      <td className="py-2 pl-3 pr-1">
                        <input
                          type="checkbox"
                          checked={pair.selected}
                          onChange={() => togglePair(idx)}
                          disabled={isPending || importStatus === "done"}
                          className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 pl-2 pr-4 font-mono font-medium text-neutral-800">
                        {pair.key}
                      </td>
                      <td className="py-2 pl-2 pr-4 font-mono text-neutral-500">
                        {maskValue(pair.value)}
                      </td>
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {/* Import summary */}
      {importStatus === "done" && (
        <div className={`rounded-lg border p-3 text-sm ${
          failedCount === 0
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}>
          {savedCount > 0 && <span>{savedCount} secret{savedCount !== 1 ? "s" : ""} saved successfully. </span>}
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
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                Import {selectedPairs.length > 0 ? `${selectedPairs.length} ` : ""}Secret{selectedPairs.length !== 1 ? "s" : ""}
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2"
          >
            Import another file
          </button>
        )}

        {rawText && importStatus !== "done" && (
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-neutral-400 hover:text-neutral-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
