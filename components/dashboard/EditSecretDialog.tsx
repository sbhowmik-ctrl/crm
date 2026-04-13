"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter }  from "next/navigation";
import { toast }      from "sonner";
import { Button }     from "@/components/ui/button";
import { Input }      from "@/components/ui/input";
import { Label }      from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { updateSecret }       from "@/app/actions/secrets";
import { decryptSecretValue } from "@/app/actions/decrypt";

// ---------------------------------------------------------------------------
// Eye toggle icon
// ---------------------------------------------------------------------------

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pencil icon for the trigger button
// ---------------------------------------------------------------------------

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  secretId:    string;
  secretKey:   string;
  environment: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditSecretDialog({ secretId, secretKey, environment }: Props) {
  const [open, setOpen]           = useState(false);
  const [key, setKey]             = useState(secretKey);
  const [value, setValue]         = useState("");
  const [showValue, setShowValue] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, startLoad]    = useTransition();
  const [isSaving,  startSave]    = useTransition();
  const router = useRouter();

  // When the dialog opens, decrypt and pre-fill the current value.
  useEffect(() => {
    if (!open) return;
    setKey(secretKey);
    setValue("");
    setSaveError(null);
    setLoadError(null);
    setShowValue(false);

    startLoad(async () => {
      const result = await decryptSecretValue(secretId);
      if (result.success) {
        setValue(result.plaintext);
      } else {
        setLoadError(result.error);
      }
    });
  }, [open, secretId, secretKey]);

  const handleSave = () => {
    setSaveError(null);
    if (!key.trim())   { setSaveError("Key is required.");   return; }
    if (!value.trim()) { setSaveError("Value is required."); return; }

    startSave(async () => {
      const result = await updateSecret({
        secretId,
        key: key.trim(),
        value: value.trim(),
        environment,
      });
      if (result.success) {
        toast.success(`Secret "${key.trim()}" updated.`);
        setOpen(false);
        router.refresh();
      } else {
        setSaveError(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label={`Edit secret ${secretKey}`}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Secret</DialogTitle>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-4 mt-1">
            {/* Key */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-key">Key</Label>
              <Input
                id="edit-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="DATABASE_URL"
                className="font-mono"
                autoComplete="off"
                disabled={isLoading || isSaving}
              />
            </div>

            {/* Value */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-value">Value</Label>
              <div className="relative">
                <Input
                  id="edit-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  type={showValue ? "text" : "password"}
                  placeholder={isLoading ? "Decrypting…" : "Enter value"}
                  className="font-mono pr-10"
                  autoComplete="new-password"
                  disabled={isLoading || isSaving}
                />
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showValue ? "Hide value" : "Show value"}
                  tabIndex={-1}
                  disabled={isLoading}
                >
                  <EyeIcon open={showValue} />
                </button>
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isLoading || isSaving}
              >
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
