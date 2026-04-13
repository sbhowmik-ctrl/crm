"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Filter, Trash2 } from "lucide-react";
import CopyAllSecretsButton from "@/components/CopyAllSecretsButton";
import AddSecretDialog from "@/components/dashboard/AddSecretDialog";
import RevealButton from "@/components/RevealButton";
import CopyButton from "@/components/CopyButton";
import EditSecretDialog from "@/components/dashboard/EditSecretDialog";
import DeleteSecretButton from "@/components/dashboard/DeleteSecretButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteEnvironment } from "@/app/actions/secrets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type ProjectSecretRow = {
  id: string;
  key: string;
  environment: string;
  ownerName: string;
  createdAtStr: string;
};

interface Props {
  project: { id: string; name: string };
  secrets: ProjectSecretRow[];
  showAddSecret: boolean;
  canMutateVault: boolean;
  canUserRequestPendingSubmission: boolean;
}

export default function ProjectSecretsWidget({
  project,
  secrets,
  showAddSecret,
  canMutateVault,
  canUserRequestPendingSubmission,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useState(false);
  const [addedEnvs, setAddedEnvs] = useState<string[]>([]);

  const [addEnvironmentOpen, setAddEnvironmentOpen] = useState(false);

  /** Which environment sections are visible. */
  const [envFilter, setEnvFilter] = useState<Record<string, boolean>>({});

  const allEnvs = useMemo(() => {
    const envsFromSecrets = secrets.map((s) => s.environment || "Default");
    return Array.from(new Set([...envsFromSecrets, ...addedEnvs]));
  }, [secrets, addedEnvs]);

  useEffect(() => {
    setEnvFilter((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const e of allEnvs) {
        if (next[e] === undefined) {
          next[e] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allEnvs]);

  const displayedEnvs = useMemo(
    () => allEnvs.filter((e) => envFilter[e] !== false),
    [allEnvs, envFilter],
  );

  const filterEnvKeys = useMemo(() => [...allEnvs].sort((a, b) => a.localeCompare(b)), [allEnvs]);

  const setEnvVisible = (name: string, visible: boolean) => {
    setEnvFilter((prev) => ({ ...prev, [name]: visible }));
  };

  const handleDeleteSection = (envName: string, hasSecrets: boolean) => {
    if (!hasSecrets) {
      setAddedEnvs((prev) => prev.filter((e) => e !== envName));
      toast.success(`Section "${envName}" removed.`);
      return;
    }

    startTransition(true);
    deleteEnvironment(project.id, envName).then((result) => {
      if (result.success) {
        toast.success(`Section "${envName}" and all its secrets deleted.`);
        setAddedEnvs((prev) => prev.filter((e) => e !== envName));
        router.refresh();
      } else {
        toast.error(result.error);
      }
      startTransition(false);
    });
  };

  return (
    <section className="space-y-6">
      
      {/* Opens from center “Add Environment” button */}
      {showAddSecret && (
        <AddSecretDialog
          projectId={project.id}
          projectName={project.name}
          allowBulkImport={canMutateVault || canUserRequestPendingSubmission}
          defaultEnvironment=""
          existingEnvironmentNames={allEnvs}
          heading="newEnvironment"
          open={addEnvironmentOpen}
          onOpenChange={setAddEnvironmentOpen}
          hideTrigger={true}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Secrets</h2>
          <p className="text-xs text-muted-foreground">
            {secrets.length} encrypted secret{secrets.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          {showAddSecret && allEnvs.length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 border-white/20 bg-white/40 text-[10px] font-black uppercase tracking-widest text-[#0c1421] shadow-sm backdrop-blur-md hover:bg-white/60"
                  >
                    <Filter className="size-3.5 opacity-70" aria-hidden />
                    Filter
                    <ChevronDown className="size-3 opacity-60" aria-hidden />
                  </Button>
                }
              />
              <PopoverContent align="center" className="w-56 space-y-3 p-3">
                <p className="text-xs font-medium text-muted-foreground">Show secrets for</p>
                <div className="space-y-2.5">
                  {filterEnvKeys.map((name) => (
                    <div key={name} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`env-filter-${name}`}
                        checked={envFilter[name] !== false}
                        onCheckedChange={(checked) =>
                          setEnvVisible(name, checked === true)
                        }
                      />
                      <Label
                        htmlFor={`env-filter-${name}`}
                        className="cursor-pointer text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {name}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {showAddSecret && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-white/20 bg-white/40 text-[10px] font-black uppercase tracking-widest text-[#0c1421] shadow-sm backdrop-blur-md hover:bg-white/60"
              onClick={() => setAddEnvironmentOpen(true)}
            >
              Add Environment
            </Button>
          )}
        </div>
      </div>

      {allEnvs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No secrets yet.{" "}
            {showAddSecret
              ? "Click Add Environment, name your section, then add secret keys and values."
              : ""}
          </p>
        </div>
      ) : displayedEnvs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No environments match the current filter. Open Filter and select at least one environment to
            show.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {displayedEnvs.map((envName) => {
            const envSecrets = secrets.filter((s) => (s.environment || "Default") === envName);
            const hasSecrets = envSecrets.length > 0;

            return (
              <div key={envName} className="space-y-3">
                {/* Section Header with Section-specific Actions */}
                <div className="flex items-center justify-between bg-muted/30 px-4 py-2.5 rounded-lg border border-border">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-600">
                    {envName}
                  </h3>
                  <div className="flex items-center gap-2">
                    {/* Create (keys) → Read (copy) → Delete (section) */}
                    {showAddSecret && (
                      <AddSecretDialog
                        projectId={project.id}
                        projectName={project.name}
                        allowBulkImport={canMutateVault || canUserRequestPendingSubmission}
                        defaultEnvironment={envName}
                        existingEnvironmentNames={allEnvs}
                        heading="addKeys"
                        lockEnvironment
                        triggerIconOnly
                      />
                    )}
                    <CopyAllSecretsButton 
                      projectId={project.id} 
                      secretCount={envSecrets.length} 
                      environment={envName} 
                    />
                    
                    {/* Delete Section Button & Dialog */}
                    {canMutateVault && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
                              disabled={isPending}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Section?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete the <strong>{envName}</strong> section? 
                              {hasSecrets 
                                ? ` This will permanently delete all ${envSecrets.length} secret(s) inside it. This action cannot be undone.` 
                                : " This will remove the empty section from your view."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteSection(envName, hasSecrets)}
                              disabled={isPending}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              {isPending ? "Deleting..." : "Delete Section"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>

                {envSecrets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-4 py-3 border border-dashed rounded-lg bg-muted/10">
                    No secrets added to this environment yet.
                  </p>
                ) : (
                  <div className="max-h-[min(50vh,30rem)] min-w-0 overflow-auto rounded-xl border border-border">
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
                        {envSecrets.map((s) => (
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
                              {s.ownerName}
                            </td>
                            <td className="py-3 px-3 text-muted-foreground">
                              {s.createdAtStr}
                            </td>
                            <td className="py-3 pl-3 pr-4">
                              <div className="flex items-center justify-end gap-1">
                                <RevealButton secretId={s.id} secretKey={s.key} />
                                <CopyButton secretId={s.id} />
                                {canMutateVault && (
                                  <EditSecretDialog
                                    secretId={s.id}
                                    secretKey={s.key}
                                    environment={envName}
                                  />
                                )}
                                {canMutateVault && <DeleteSecretButton secretId={s.id} secretKey={s.key} />}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}