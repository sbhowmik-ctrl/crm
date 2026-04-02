"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateProject } from "@/app/actions/projects";

export default function EditProjectDialog({ project }: { project: { id: string, name: string, description: string | null } }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [desc, setDesc] = useState(project.description ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateProject({ projectId: project.id, name, description: desc });
      if (res.success) {
        toast.success("Project updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="size-4" /></Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} disabled={isPending} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} disabled={isPending} />
          </div>
          <Button onClick={handleSave} className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}