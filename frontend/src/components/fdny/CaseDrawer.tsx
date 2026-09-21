import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PriorityBadge, StatusBadge } from "@/components/fdny/StatusBadge";
import type { ServiceCase } from "@/lib/mock-data";

interface Props {
  caseItem: ServiceCase | null;
  onClose: () => void;
  onAct: (label: string) => void;
  /** Case actions. None are wired to GLPI, so both views pass an empty list. */
  actions?: string[];
  resolveLabel?: string;
}

export function CaseDrawer({
  caseItem,
  onClose,
  onAct,
  actions = [],
  resolveLabel = "",
}: Props) {
  return (
    <Sheet open={Boolean(caseItem)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {caseItem ? (
          <>
            <SheetHeader className="gap-1">
              <SheetTitle className="font-display text-xl font-extrabold">{caseItem.id}</SheetTitle>
              <p className="text-sm text-muted-foreground">{caseItem.issue}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={caseItem.status} />
                <PriorityBadge priority={caseItem.priority} />
                <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {caseItem.category}
                </span>
              </div>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <Section title="Requester">
                <p className="text-sm font-medium">{caseItem.requesterTitle}</p>
                <p className="text-sm text-muted-foreground">{caseItem.requester}</p>
                <p className="text-sm text-muted-foreground">{caseItem.requesterContact}</p>
              </Section>

              <Section title="Device & location">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field label="Asset" value={caseItem.asset} />
                  <Field label="Model" value={caseItem.assetModel} />
                  <Field label="Location" value={caseItem.location} />
                  <Field label="Created" value={caseItem.created} />
                  <Field label="Assigned to" value={caseItem.assignedTo} />
                </dl>
              </Section>

              <Section title="Description">
                <p className="text-sm text-foreground/85">{caseItem.description}</p>
              </Section>

              <Section title="AI diagnostic summary">
                <p className="rounded-lg border bg-steel/6 p-3 text-sm text-foreground/85">
                  {caseItem.aiSummary}
                </p>
              </Section>

              <Section title="Timeline">
                <ol className="space-y-3">
                  {caseItem.timeline.map((t) => (
                    <li key={t.at + t.label} className="flex gap-3 text-sm">
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                      <span>
                        <span className="font-semibold">{t.at}</span>
                        <span className="block text-muted-foreground">{t.label}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>

              <Section title="Technician notes">
                {caseItem.notes.length ? (
                  <ul className="space-y-3">
                    {caseItem.notes.map((n) => (
                      <li key={n.at + n.author} className="rounded-lg border p-3 text-sm">
                        <p className="text-xs font-semibold text-muted-foreground">
                          {n.author} · {n.at}
                        </p>
                        <p className="mt-1">{n.text}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No technician notes yet.
                  </p>
                )}
              </Section>

              <Section title="Attachments">
                {caseItem.attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {caseItem.attachments.map((a) => (
                      <span key={a} className="rounded-md border bg-muted px-2.5 py-1 text-xs">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No attachments.</p>
                )}
              </Section>

              {actions.length || resolveLabel ? (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button key={a} variant="outline" size="sm" onClick={() => onAct(a)}>
                        {a}
                      </Button>
                    ))}
                    {resolveLabel ? (
                      <Button size="sm" onClick={() => onAct(resolveLabel)}>
                        {resolveLabel}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
