"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
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
import { archiveCredentialSection } from "@/app/actions/credentials";

interface Props {
  sectionId: string;
  sectionName: string;
}

export default function CredentialArchiveSectionButton({ sectionId, sectionName }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleArchive = () => {
    startTransition(async () => {
      const result = await archiveCredentialSection({ sectionId });
      if (result.success) {
        toast.success("Section archived.");
        router.push("/dashboard/credentials");
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
            aria-label="Archive credential section"
            title="Archive"
            disabled={isPending}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-muted text-muted-foreground">
            <Archive className="size-5" aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>Archive &ldquo;{sectionName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            The section will move to the archive portal. You can restore it from there.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleArchive} disabled={isPending}>
            {isPending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
