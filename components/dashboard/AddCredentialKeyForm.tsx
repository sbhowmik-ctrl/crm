"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCredentialKey } from "@/app/actions/credentials";

interface Props {
  sectionId: string;
  /** USER submits for approval; elevated roles add immediately. */
  userRole: Role;
}

export default function AddCredentialKeyForm({ sectionId, userRole }: Props) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const l = label.trim();
    const v = value.trim();
    if (!l || !v) {
      setError("Key and value are required.");
      return;
    }

    startTransition(async () => {
      const result = await createCredentialKey({ sectionId, label: l, value: v });
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.pendingApproval) {
        toast.success("Submitted for admin approval. The key will appear after it is authorized.");
      } else {
        toast.success("Key added.");
      }
      setLabel("");
      setValue("");
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-white/40 bg-white/40 p-4"
    >
      <div className="flex w-44 min-w-0 flex-col gap-1.5">
        <label
          htmlFor="credential-key-label"
          className="text-[10px] font-semibold uppercase tracking-widest text-slate-500"
        >
          Key
        </label>
        <Input
          id="credential-key-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Key"
          className="h-9 w-full"
          disabled={isPending}
          required
        />
      </div>
      <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
        <label
          htmlFor="credential-key-value"
          className="text-[10px] font-semibold uppercase tracking-widest text-slate-500"
        >
          Value
        </label>
        <Input
          id="credential-key-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          className="h-9 w-full"
          disabled={isPending}
          required
        />
      </div>
      <Button type="submit" className="h-9 text-[10px] font-black uppercase tracking-widest" disabled={isPending}>
        {isPending ? "Saving…" : userRole === Role.USER ? "Submit for approval" : "Add key"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
      {userRole === Role.USER && (
        <p className="w-full text-[11px] text-muted-foreground">
          Your organization requires admin approval before new keys are stored in this section.
        </p>
      )}
    </form>
  );
}
