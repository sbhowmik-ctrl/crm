"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { parseEnvText, type EnvPair } from "@/lib/env-parser";
import { resolveCanonicalEnvironmentName } from "@/lib/environment-name";
import { saveSecretsFromEnv, type SecretImportOutcome } from "@/app/actions/secrets";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

interface SelectablePair extends EnvPair {
  selected: boolean;
}

type ImportStatus = "idle" | "importing" | "done";

function maskValue(value: string): string {
  if (value.length === 0) return "(empty)";
  if (value.length <= 4) return "••••";
  return value.slice(0, 4) + "•".repeat(Math.min(value.length - 4, 10));
}

function StatusBadge({ outcome }: { outcome: SecretImportOutcome }) {
  if (outcome.status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <svg className="mr-1 h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        Saved
      </span>
    );
  }
  if (outcome.status === "pending") {
    return (
      <span className="inline-flex max-w-xs items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        Pending approval
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-xs items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={outcome.error}>
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
  environment: string;
  existingEnvironmentNames?: readonly string[];
  onImportSuccess?: () => void;
}

export default function EnvFileImporter({
  projectId,
  projectName,
  environment,
  existingEnvironmentNames = [],
  onImportSuccess,
}: EnvFileImporterProps) {
  const [rawText,      setRawText]      = useState("");
  const [pairs,        setPairs]        = useState<SelectablePair[]>([]);
  const [outcomes,     setOutcomes]     = useState<SecretImportOutcome[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [globalError,  setGlobalError]  = useState<string | null>(null);
  const [isDragging,   setIsDragging]   = useState(false); 
  const [isPending,    startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = useCallback((text: string) => {
    setRawText(text);
    setOutcomes([]);
    setGlobalError(null);
    setImportStatus("idle");
    const { pairs: parsed } = parseEnvText(text);
    setPairs(parsed.map((p) => ({ ...p, selected: true })));
  }, []);

  // -- File Upload Handler --
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => handleTextChange(event.target?.result as string);
    reader.readAsText(file);
    e.target.value = ""; 
  }, [handleTextChange]);

  // -- Drag and Drop Handlers --
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => handleTextChange(event.target?.result as string);
    reader.readAsText(file);
  };

  const togglePair = useCallback((index: number) => {
    setPairs((prev) => prev.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p)));
  }, []);

  const toggleAll = useCallback((selected: boolean) => {
    setPairs((prev) => prev.map((p) => ({ ...p, selected })));
  }, []);

  const selectedPairs = useMemo(() => pairs.filter((p) => p.selected), [pairs]);
  const outcomeMap = useMemo(() => new Map(outcomes.map((o) => [o.key, o])), [outcomes]);

  const handleImport = useCallback(() => {
    const finalEnv = resolveCanonicalEnvironmentName(environment, existingEnvironmentNames);

    if (selectedPairs.length === 0) return;

    setImportStatus("importing");
    setGlobalError(null);

    startTransition(async () => {
      const result = await saveSecretsFromEnv(
        selectedPairs.map(({ key, value }) => ({ key, value })),
        projectId,
        finalEnv
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

      if (savedCount > 0) toast.success(`Saved ${savedCount} secret(s).`);
      if (pendingCount > 0) toast.success(`Submitted ${pendingCount} secret(s) for approval.`);
      if (savedCount > 0 || pendingCount > 0) onImportSuccess?.();
    });
  }, [selectedPairs, projectId, environment, existingEnvironmentNames, onImportSuccess]);

  const handleReset = useCallback(() => {
    setRawText("");
    setPairs([]);
    setOutcomes([]);
    setGlobalError(null);
    setImportStatus("idle");
  }, []);

  return (
    <div className="w-full min-w-0 space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".env,.txt,text/plain"
        className="hidden"
        onChange={handleFileUpload}
        aria-hidden
      />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Paste contents or drag & drop a <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code> file.
        </p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed"
        >
          <UploadCloud className="size-3.5" /> Upload file
        </button>
      </div>

      {/* Drag & Drop Dropzone Area */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative max-h-[min(40vh,14rem)] min-h-0 min-w-0 overflow-auto rounded-lg border transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50/50" : "border-border bg-muted/30"
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-50/80 backdrop-blur-sm z-10 rounded-lg">
            <p className="text-blue-600 font-bold text-sm pointer-events-none">Drop .env file here</p>
          </div>
        )}
        <textarea
          rows={7}
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={"# Paste or Drop your .env content here\nDATABASE_URL=postgres://user:pass@localhost/db\nSTRIPE_SECRET_KEY=sk_live_..."}
          spellCheck={false}
          className="box-border min-h-[8.75rem] w-full min-w-0 max-w-none resize-none bg-transparent p-3 font-mono text-sm whitespace-pre text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          disabled={isPending}
        />
      </div>

      {/* Parsed preview */}
      {pairs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {pairs.length} key{pairs.length !== 1 ? "s" : ""} parsed
              {selectedPairs.length !== pairs.length && (
                <span className="ml-1 text-muted-foreground">({selectedPairs.length} selected)</span>
              )}
            </p>
            <div className="flex gap-3 text-xs text-primary">
              <button type="button" onClick={() => toggleAll(true)} className="hover:underline">Select all</button>
              <button type="button" onClick={() => toggleAll(false)} className="hover:underline">Deselect all</button>
            </div>
          </div>

          <div className="max-h-[min(45vh,24rem)] min-h-0 min-w-0 overflow-auto rounded-lg border border-border">
            <table className="w-max min-w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/50 text-xs text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="w-8 py-2 pl-3 pr-1 text-left font-medium"></th>
                  <th className="whitespace-nowrap py-2 pl-2 pr-4 text-left font-medium">Key</th>
                  <th className="whitespace-nowrap py-2 pl-2 pr-4 text-left font-medium">Value (masked)</th>
                  {importStatus === "done" && <th className="whitespace-nowrap py-2 pl-2 pr-3 text-right font-medium">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pairs.map((pair, idx) => {
                  const outcome = outcomeMap.get(pair.key);
                  return (
                    <tr key={`${pair.key}-${idx}`} className={`transition-colors ${pair.selected ? "bg-background" : "bg-muted/30 opacity-50"}`}>
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

      {globalError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{globalError}</div>}

      <div className="flex items-center gap-3">
        {importStatus !== "done" ? (
          <button
            type="button"
            onClick={handleImport}
            disabled={isPending || selectedPairs.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : `Import ${selectedPairs.length > 0 ? `${selectedPairs.length} ` : ""}Secret${selectedPairs.length !== 1 ? "s" : ""}`}
          </button>
        ) : (
          <button type="button" onClick={handleReset} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
            Import another file
          </button>
        )}
      </div>
    </div>
  );
}