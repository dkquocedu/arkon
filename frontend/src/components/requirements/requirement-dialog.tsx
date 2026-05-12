"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EditableRequirement = {
  id: string;
  title: string;
  description?: string;
  acceptance_criteria?: string;
  priority: string;
  project_id?: string;
  assignee_id?: string;
};

type Project = { id: string; name: string };
type Employee = { id: string; name: string };

type FormState = {
  title: string;
  description: string;
  acceptanceCriteria: string;
  priority: string;
  projectId: string;
  assigneeId: string;
};

type Props = {
  requirement?: EditableRequirement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function RequirementDialog({ requirement, open, onOpenChange, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Lazy initializer runs on mount; parent uses key prop to remount on each open
  const [form, setForm] = useState<FormState>(() => ({
    title: requirement?.title ?? "",
    description: requirement?.description ?? "",
    acceptanceCriteria: requirement?.acceptance_criteria ?? "",
    priority: requirement?.priority ?? "medium",
    projectId: requirement?.project_id ?? "",
    assigneeId: requirement?.assignee_id ?? "",
  }));

  useEffect(() => {
    if (!open) return;
    // setState calls here are inside .then() (async), not synchronous in the effect body
    Promise.all([
      api<Project[]>("/api/projects").catch(() => []),
      api<Employee[] | { items: Employee[] }>("/api/employees").catch(() => []),
    ]).then(([p, e]) => {
      setProjects(p);
      setEmployees(Array.isArray(e) ? e : ((e as { items: Employee[] }).items ?? []));
    });
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        acceptance_criteria: form.acceptanceCriteria.trim() || null,
        priority: form.priority,
        project_id: form.projectId || null,
        assignee_id: form.assigneeId || null,
      };
      if (requirement) {
        await api(`/api/requirements/${requirement.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/requirements", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      alert("Save failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{requirement ? "Edit Requirement" : "New Requirement"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="ur-title">Title *</Label>
            <Input
              id="ur-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Requirement title"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ur-desc">Description</Label>
            <Textarea
              id="ur-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Detailed description"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ur-ac">Acceptance Criteria</Label>
            <Textarea
              id="ur-ac"
              value={form.acceptanceCriteria}
              onChange={(e) => setForm((f) => ({ ...f, acceptanceCriteria: e.target.value }))}
              placeholder="Given / When / Then"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v ?? "medium" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select
              value={form.assigneeId}
              onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v ?? "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : requirement ? "Save Changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
