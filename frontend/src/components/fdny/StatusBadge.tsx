import { cn } from "@/lib/utils";
import type { CaseStatus, Priority } from "@/lib/mock-data";

const statusStyles: Record<CaseStatus, string> = {
  Open: "bg-info/10 text-info border-info/25",
  Investigating: "bg-warning/15 text-warning-foreground border-warning/40",
  "Waiting for User": "bg-muted text-muted-foreground border-border",
  Resolved: "bg-success/12 text-success border-success/30",
  Escalated: "bg-primary/10 text-primary border-primary/30",
};

const priorityStyles: Record<Priority, string> = {
  Critical: "bg-primary text-primary-foreground border-primary",
  High: "bg-primary/12 text-primary border-primary/30",
  Medium: "bg-warning/15 text-warning-foreground border-warning/40",
  Low: "bg-muted text-muted-foreground border-border",
};

const base =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span className={cn(base, statusStyles[status], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return <span className={cn(base, priorityStyles[priority], className)}>{priority}</span>;
}
