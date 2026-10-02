import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { CaseDrawer } from "@/components/fdny/CaseDrawer";
import { PriorityBadge, StatusBadge } from "@/components/fdny/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { staffNav } from "@/lib/nav";
import { useRequireStaff } from "@/lib/session";
import { staffUser, type CaseStatus, type Priority, type ServiceCase } from "@/lib/mock-data";
import { getTicket, getTickets, type GlpiTicket } from "@/lib/api";
import { originOf, ticketToServiceCase } from "@/lib/glpi-adapters";

export const Route = createFileRoute("/staff/cases")({
  head: () => ({
    meta: [
      { title: "Case Queue — Fire Department Service Desk" },
      {
        name: "description",
        content:
          "The full service-desk case queue with filters for status, priority, category, and assignee.",
      },
      { property: "og:title", content: "Case Queue — Fire Department Service Desk" },
      {
        property: "og:description",
        content: "Work the queue: filter, sort, and open any case in the concept service desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffCasesPage,
});

const PAGE_SIZE = 8;
const statuses: CaseStatus[] = [
  "Open",
  "Investigating",
  "Waiting for User",
  "Resolved",
  "Escalated",
];
const priorities: Priority[] = ["Critical", "High", "Medium", "Low"];


function StaffCasesPage() {
  // A member who types this URL is redirected to the member portal.
  const { allowed, navUser } = useRequireStaff();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CaseStatus>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [assignee, setAssignee] = useState("all");
  const [category, setCategory] = useState("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ServiceCase | null>(null);

  // Live GLPI tickets, projected into the shape this table and the CaseDrawer
  // already render.
  const [tickets, setTickets] = useState<GlpiTicket[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getTickets(100)
      .then((t) => {
        if (cancelled) return;
        setTickets(t);
        setLoadState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Could not load tickets.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const cases = useMemo(() => tickets.map(ticketToServiceCase), [tickets]);
  const originById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tickets) {
      const o = originOf(t);
      if (o) m.set(t.reference ?? `GLPI-${t.id}`, o.label);
    }
    return m;
  }, [tickets]);
  const assignees = useMemo(() => Array.from(new Set(cases.map((c) => c.assignedTo))).sort(), [cases]);
  const categories = useMemo(() => Array.from(new Set(cases.map((c) => c.category))).sort(), [cases]);

  /** Opening a case pulls full detail so the drawer shows the real content. */
  const openCase = async (c: ServiceCase) => {
    setSelected(c);
    const t = tickets.find((x) => (x.reference ?? `GLPI-${x.id}`) === c.id);
    if (!t) return;
    try {
      const full = await getTicket(t.id);
      setSelected(ticketToServiceCase(full));
    } catch {
      /* keep the list projection if the detail call fails */
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = cases.filter((c) => {
      const matches =
        !q ||
        [c.id, c.issue, c.requester, c.asset, c.location, c.assignedTo, c.category]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return (
        matches &&
        (status === "all" || c.status === status) &&
        (priority === "all" || c.priority === priority) &&
        (assignee === "all" || c.assignedTo === assignee) &&
        (category === "all" || c.category === category)
      );
    });
    return [...rows].sort((a, b) =>
      sortAsc ? a.created.localeCompare(b.created) : b.created.localeCompare(a.created),
    );
  }, [cases, query, status, priority, assignee, category, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const clear = () => {
    setQuery("");
    setStatus("all");
    setPriority("all");
    setAssignee("all");
    setCategory("all");
    setPage(1);
  };

  const summary = {
    unassigned: cases.filter((c) => c.assignedTo === "Unassigned").length,
    escalated: cases.filter((c) => c.status === "Escalated").length,
    waiting: cases.filter((c) => c.status === "Waiting for User").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        theme="navy"
        brandSubtitle="Service Desk Operations"
        items={staffNav}
        user={navUser ?? { name: "Service desk", initials: "SD" }}
        accountArea="staff"
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="inline-flex items-center gap-2 font-display text-3xl font-extrabold">
              <Inbox className="size-7 text-primary" /> Case Queue
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {loadState === "loading"
                ? "Loading the queue from GLPI…"
                : loadState === "error"
                  ? (loadError ?? "The queue could not be loaded.")
                  : `${filtered.length} of ${cases.length} cases shown`} · {summary.unassigned}{" "}
              unassigned · {summary.escalated} escalated · {summary.waiting} waiting on a requester
            </p>
          </div>
          <Button variant="outline" onClick={() => setSortAsc((v) => !v)}>
            <ArrowUpDown className="size-4" /> {sortAsc ? "Oldest first" : "Newest first"}
          </Button>
        </header>

        <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search cases, devices, units"
                className="w-56 pl-9"
                aria-label="Search cases"
              />
            </div>
            <Filter
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v as CaseStatus | "all");
                setPage(1);
              }}
              options={statuses}
              allLabel="All statuses"
            />
            <Filter
              label="Priority"
              value={priority}
              onChange={(v) => {
                setPriority(v as Priority | "all");
                setPage(1);
              }}
              options={priorities}
              allLabel="All priorities"
            />
            <Filter
              label="Category"
              value={category}
              onChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
              options={categories}
              allLabel="All categories"
            />
            <Filter
              label="Assignee"
              value={assignee}
              onChange={(v) => {
                setAssignee(v);
                setPage(1);
              }}
              options={assignees}
              allLabel="Anyone"
            />
            <Button variant="ghost" onClick={clear}>
              Clear
            </Button>
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-semibold">No cases match those filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Widen the search or clear the filters to see the whole queue.
              </p>
              <Button className="mt-4" variant="outline" onClick={clear}>
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        "Ticket ID",
                        "Issue",
                        "Requester",
                        "Asset",
                        "Category",
                        "Priority",
                        "Status",
                        "Assigned To",
                        "Created",
                      ].map((h) => (
                        <TableHead key={h} className="whitespace-nowrap">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => openCase(c)}
                      >
                        <TableCell className="font-semibold whitespace-nowrap">{c.id}</TableCell>
                        <TableCell className="max-w-64 truncate">{c.issue}</TableCell>
                        <TableCell className="whitespace-nowrap">{c.requester}</TableCell>
                        <TableCell className="whitespace-nowrap">{c.asset}</TableCell>
                        <TableCell className="whitespace-nowrap">{c.category}</TableCell>
                        <TableCell>
                          <PriorityBadge priority={c.priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "whitespace-nowrap",
                            c.assignedTo === "Unassigned" && "font-semibold text-primary",
                          )}
                        >
                          {c.assignedTo}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {c.created}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {rows.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openCase(c)}
                    className="w-full rounded-xl border bg-background p-4 text-left transition-shadow hover:shadow-card"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{c.id}</span>
                      <PriorityBadge priority={c.priority} />
                    </div>
                    <p className="mt-1 text-sm font-medium">{c.issue}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.requester} · {c.asset}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-muted-foreground">{c.assignedTo}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
                <span className="text-muted-foreground">
                  Showing {(current - 1) * PAGE_SIZE + 1}–
                  {Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length} cases
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={current === 1}
                    onClick={() => setPage(current - 1)}
                  >
                    <ChevronLeft className="size-4" /> Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {current} of {pageCount}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={current === pageCount}
                    onClick={() => setPage(current + 1)}
                  >
                    Next <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </main>

      <Footer />

      <CaseDrawer
        caseItem={selected}
        onClose={() => setSelected(null)}
        // No case action writes to GLPI, so the drawer shows none.
        onAct={() => {}}
      />
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
