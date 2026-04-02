"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { createCredentialSection } from "@/app/actions/credentials";

export default function AddCredentialSectionDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCreate = () => {
    setError(null);
    if (!name.trim()) {
      setError("Section name is required.");
      return;
    }

    startTransition(async () => {
      const result = await createCredentialSection({
        name:        name.trim(),
        description: desc.trim() || undefined,
      });
      if (result.success) {
        toast.success("Section created.");
        setOpen(false);
        setName("");
        setDesc("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setError(null);
          setName("");
          setDesc("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <svg className="mr-1.5 h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v12M2 8h12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Add Section
          </Button>
        }
      />

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create credential section</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cs-name">Name</Label>
            <Input
              id="cs-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production API keys"
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cs-desc">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cs-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Shared credentials for the billing service"
              disabled={isPending}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="button"
            onClick={handleCreate}
            className="w-full"
            disabled={isPending}
          >
            {isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
