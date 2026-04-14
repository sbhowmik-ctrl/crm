"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter }               from "next/navigation";
import { toast }                   from "sonner";
import { Plus, Trash2 }            from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import EnvFileImporter from "@/components/EnvFileImporter";
import { saveSecretsFromEnv } from "@/app/actions/secrets";
import { resolveCanonicalEnvironmentName } from "@/lib/environment-name";

// ---------------------------------------------------------------------------
// Manual multi-secret form
// ---------------------------------------------------------------------------

function ManualSecretForm({
  projectId,
  environment,
  existingEnvironmentNames,
  onSuccess,
}: {
  projectId: string;
  environment: string;
  existingEnvironmentNames: readonly string[];
  onSuccess: () => void;
}) {
  const [pairs, setPairs] = useState([{ id: Date.now(), key: "", value: "" }]);
  const [isPending, startTransition] = useTransition();

  const handleAddRow = () => {
    setPairs([...pairs, { id: Date.now(), key: "", value: "" }]);
  };

  const handleRemoveRow = (id: number) => {
    setPairs(pairs.filter(p => p.id !== id));
  };

  const updatePair = (id: number, field: "key" | "value", val: string) => {
    setPairs(pairs.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const handleSubmit = () => {
    const finalEnv = resolveCanonicalEnvironmentName(environment, existingEnvironmentNames);

    const validPairs = pairs.filter(p => p.key.trim() && p.value.trim());
    if (validPairs.length === 0) {
      toast.error("Please add at least one valid key and value.");
      return;
    }

    startTransition(async () => {
      const result = await saveSecretsFromEnv(validPairs, projectId, finalEnv);
      
      if (result.success) {
        const saved = result.outcomes.filter(o => o.status === "saved").length;
        const pending = result.outcomes.filter(o => o.status === "pending").length;
        
        if (saved > 0) toast.success(`Saved ${saved} secret(s).`);
        if (pending > 0) toast.success(`Submitted ${pending} secret(s) for approval.`);
        
        setPairs([{ id: Date.now(), key: "", value: "" }]);
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Label>Secrets Preview</Label>
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
          {pairs.map((pair) => (
            <div key={pair.id} className="flex items-center gap-2">
              <Input
                placeholder="KEY"
                value={pair.key}
                onChange={(e) => updatePair(pair.id, "key", e.target.value)}
                className="font-mono w-1/3"
                disabled={isPending}
              />
              <Input
                placeholder="Value"
                value={pair.value}
                onChange={(e) => updatePair(pair.id, "value", e.target.value)}
                className="font-mono w-full"
                type="password"
                disabled={isPending}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-red-500 hover:bg-red-50"
                onClick={() => handleRemoveRow(pair.id)}
                disabled={pairs.length === 1 || isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleAddRow} disabled={isPending}>
          <Plus className="mr-1.5 size-4" /> Add Another
        </Button>
      </div>

      <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Save Secrets"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export type AddSecretDialogHeading = "addSecrets" | "newEnvironment" | "addKeys";

interface Props {
  projectId:   string;
  projectName: string;
  allowBulkImport?: boolean;
  defaultEnvironment?: string;
  /** Section names already used in this project (for case-insensitive matching). */
  existingEnvironmentNames?: readonly string[];
  /** Title and primary action copy. */
  heading?: AddSecretDialogHeading;
  /**
   * When true, the environment is fixed to `defaultEnvironment` (add keys to an existing section).
   * The section name field is hidden — Create (keys) runs against that environment only.
   */
  lockEnvironment?: boolean;
  triggerIconOnly?: boolean;
  /** Overrides the default trigger button label. */
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export default function AddSecretDialog({
  projectId,
  projectName,
  allowBulkImport = true,
  defaultEnvironment = "",
  existingEnvironmentNames = [],
  heading = "addSecrets",
  lockEnvironment = false,
  triggerIconOnly = false,
  triggerLabel,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  hideTrigger = false,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [environment, setEnvironment] = useState(defaultEnvironment);
  const router = useRouter();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const effectiveEnvironment = lockEnvironment
    ? (defaultEnvironment ?? "")
    : environment;

  const dialogTitle =
    heading === "newEnvironment"
      ? `New environment — ${projectName}`
      : heading === "addKeys"
        ? `Add keys — ${(defaultEnvironment || "Default").trim() || "Default"} — ${projectName}`
        : `Add secrets — ${projectName}`;

  const defaultTriggerLabel =
    triggerLabel ??
    (triggerIconOnly
      ? "Add keys"
      : heading === "newEnvironment"
        ? "New environment"
        : "Add secrets");

  const handleOpenChange = (newOpen: boolean) => {
    if (setControlledOpen) setControlledOpen(newOpen);
    else setInternalOpen(newOpen);
  };

  useEffect(() => {
    if (isOpen) {
      setEnvironment(defaultEnvironment ?? "");
    }
  }, [isOpen, defaultEnvironment]);

  const handleSuccess = () => {
    handleOpenChange(false);
    setEnvironment(defaultEnvironment);
    router.refresh();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!hideTrigger && (
        <DialogTrigger
          render={
            triggerIconOnly ? (
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5">
                <Plus className="size-3.5" />
                {defaultTriggerLabel}
              </Button>
            ) : (
              <Button size="sm">
                <Plus className="mr-1.5 size-4" />
                {defaultTriggerLabel}
              </Button>
            )
          }
        />
      )}

      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {lockEnvironment ? (
            <div className="space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Environment</p>
              <p className="font-mono text-sm font-semibold tracking-wide">
                {(defaultEnvironment || "Default").trim() || "Default"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="env-section">Section / environment name</Label>
              <Input
                id="env-section"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value.toUpperCase())}
                placeholder="E.G. PRODUCTION, STAGING"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          {allowBulkImport ? (
            <Tabs defaultValue="manual" className="mt-1">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">Write manually</TabsTrigger>
                <TabsTrigger value="env">Paste / upload .env</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="mt-4">
                <ManualSecretForm 
                  projectId={projectId} 
                  environment={effectiveEnvironment} 
                  existingEnvironmentNames={existingEnvironmentNames}
                  onSuccess={handleSuccess} 
                />
              </TabsContent>

              <TabsContent value="env" className="mt-4">
                <EnvFileImporter
                  projectId={projectId}
                  projectName={projectName}
                  environment={effectiveEnvironment}
                  existingEnvironmentNames={existingEnvironmentNames}
                  onImportSuccess={handleSuccess}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="mt-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Your submission will be sent to an administrator for approval before it appears in this project.
              </p>
              <ManualSecretForm 
                projectId={projectId} 
                environment={effectiveEnvironment} 
                existingEnvironmentNames={existingEnvironmentNames}
                onSuccess={handleSuccess} 
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}