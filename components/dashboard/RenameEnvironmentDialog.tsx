"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { renameEnvironment } from "@/app/actions/secrets";

interface Props {
  projectId: string;
  currentName: string;
  /** Other section names in this project (including current); used to prevent duplicates client-side. */
  existingEnvironmentNames: string[];
  /** When the section only exists in local state (new env, no keys yet). */
  isClientOnlySection: boolean;
  onRenameClientOnly?: (oldName: string, newName: string) => void;
}

export default function RenameEnvironmentDialog({
  projectId,
  currentName,
  existingEnvironmentNames,
  isClientOnlySection,
  onRenameClientOnly,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setName(currentName);
      setError(null);
    }
  };

  const handleSave = () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (trimmed === currentName) {
      setOpen(false);
      return;
    }
    const taken = existingEnvironmentNames.some(
      (e) => e !== currentName && e === trimmed,
    );
    if (taken) {
      setError(`The name "${trimmed}" is already used in this project.`);
      return;
    }

    if (isClientOnlySection && onRenameClientOnly) {
      onRenameClientOnly(currentName, trimmed);
      toast.success(`Section renamed to "${trimmed}".`);
      setOpen(false);
      return;
    }

    startTransition(async () => {
      const result = await renameEnvironment(projectId, currentName, trimmed);
      if (result.success) {
        toast.success(`Section renamed to "${trimmed}".`);
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
            aria-label={`Rename section ${currentName}`}
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename section</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="space-y-1.5">
            <Label htmlFor="rename-env">Section / environment name</Label>
            <Input
              id="rename-env"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="E.G. PRODUCTION, STAGING"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={isPending}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
