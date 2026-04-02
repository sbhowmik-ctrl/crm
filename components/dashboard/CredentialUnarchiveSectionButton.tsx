"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { unarchiveCredentialSection } from "@/app/actions/credentials";

interface Props {
  sectionId: string;
  sectionName: string;
}

export default function CredentialUnarchiveSectionButton({ sectionId, sectionName }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleRestore = () => {
    startTransition(async () => {
      const result = await unarchiveCredentialSection({ sectionId });
      if (result.success) {
        toast.success("Section restored.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            aria-label="Restore credential section"
            title="Unarchive"
            disabled={isPending}
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-muted text-muted-foreground">
            <ArchiveRestore className="size-5" aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>Restore &ldquo;{sectionName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            The section will appear again in the main Credentials list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRestore} disabled={isPending}>
            {isPending ? "Restoring…" : "Restore"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
