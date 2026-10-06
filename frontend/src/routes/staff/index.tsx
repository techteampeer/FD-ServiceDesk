import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  Smartphone,
  Ticket,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { CaseDrawer } from "@/components/fdny/CaseDrawer";
import { Footer } from "@/components/fdny/Footer";
import { KpiCard } from "@/components/fdny/KpiCard";
import { PriorityBadge, StatusBadge } from "@/components/fdny/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
import { getDashboard, getTickets, type DashboardSummary, type GlpiTicket } from "@/lib/api";
import { ticketToServiceCase } from "@/lib/glpi-adapters";
import {
  type CaseStatus,
  type Priority,
  type ServiceCase,
} from "@/lib/mock-data";

export const Route = createFileRoute("/staff/")({
  head: () => ({
    meta: [
      { title: "IT Service Desk Dashboard — Fire Department Portal" },
      {
        name: "description",
        content:
          "Concept service-desk dashboard: case queue, device recovery, connectivity automation, inventory validation, and resolution analytics.",
      },
      { property: "og:title", content: "IT Service Desk Dashboard — Fire Department Portal" },
      {
        property: "og:description",
        content:
          "Monitor cases, field devices, connectivity, and service automation in a concept dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffPage,
});

const PAGE_SIZE = 6;
const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const automationIcons = { devices: Smartphone, tags: Database, cases: Ticket } as const;

function StaffPage() {
  // A member who types this URL is redirected to the member portal.
  const { allowed, navUser } = useRequireStaff();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CaseStatus>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ServiceCase | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("Sep 18, 2026 · 08:24");

  // Live GLPI: aggregate counts plus the recent-case table.
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tickets, setTickets] = useState<GlpiTicket[]>([]);

  // Bumped by the Refresh button so the effect below runs again.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    // Settled independently: a failure on one call must not blank the whole
    // dashboard. GLPI occasionally throttles the aggregate query.
    getDashboard()
      .then((d) => {
        if (cancelled) return;
        setSummary(d);
        // Replace the placeholder timestamp with when the data was actually read.
        if (d.generatedAt) setUpdatedAt(new Date(d.generatedAt).toLocaleString());
      })
      .catch(() => {
        /* KPI tiles fall back to zeroes */
      });
    getTickets(12)
      .then((t) => !cancelled && setTickets(t))
      .catch(() => {
        /* the recent-case table stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, reloadKey]);

  const cases = useMemo(() => tickets.map((t) => ticketToServiceCase(t)), [tickets]);

  /** KPI tiles fed by real counts, in the shape KpiCard already renders. */
  const liveKpis = useMemo(
    () => [
      // trend/direction are required by KpiCard; there is no historical series
      // in this demo, so they stay neutral rather than showing invented deltas.
      { label: "Open Cases", value: summary?.tickets.open ?? 0, trend: "live", direction: "up" as const, hint: "live" },
      { label: "Closed Cases", value: summary?.tickets.closed ?? 0, trend: "live", direction: "down" as const, hint: "live" },
      { label: "Managed Devices", value: summary?.devices.total ?? 0, trend: "live", direction: "up" as const, hint: "Computers + Phones" },
      {
        label: "Auto-Resolved",
        value: summary?.automation.autoResolved ?? 0,
        trend: "simulated",
        direction: "up" as const,
        hint: "simulated resets, auto-closed",
      },
    ],
    [summary],
  );

  const liveByCategory = useMemo(
    () => (summary?.tickets.byCategory ?? []).map((c) => ({ name: c.name, value: c.count })),
    [summary],
  );
  const livePriority = useMemo(
    () => (summary?.tickets.byPriority ?? []).map((p) => ({ name: p.name, value: p.count })),
    [summary],
  );
  const liveLocations = useMemo(
    () => (summary?.tickets.byLocation ?? []).map((l) => ({ name: l.name, value: l.count })),
    [summary],
  );
  const liveDeviceTypes = useMemo(
    () => (summary?.devices.byGlpiType ?? []).map((d) => ({ name: d.name, value: d.count })),
    [summary],
  );
  const locationMax = Math.max(1, ...liveLocations.map((l) => l.value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = cases.filter((c) => {
      const matchesQuery =
        !q ||
        [c.id, c.issue, c.requester, c.asset, c.location, c.assignedTo, c.category]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return (
        matchesQuery &&
        (status === "all" || c.status === status) &&
        (priority === "all" || c.priority === priority)
      );
    });
    return [...rows].sort((a, b) =>
      sortAsc ? a.created.localeCompare(b.created) : b.created.localeCompare(a.created),
    );
  }, [cases, query, status, priority, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /** Really re-reads GLPI; it used to only move the timestamp. */
  const refresh = () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    Promise.allSettled([getDashboard(), getTickets(12)]).finally(() => {
      setRefreshing(false);
      toast.success("Reloaded cases");
    });
  };

  // No case action writes to GLPI, so the drawer shows none. Kept as a no-op
  // because CaseDrawer requires the prop.
  const act = () => {};

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        theme="navy"
        brandSubtitle="Service Desk Operations"
        items={staffNav}
        user={navUser ?? { name: "Service desk", initials: "SD" }}
        accountArea="staff"
      />

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold">IT Service Desk Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor cases, field devices, connectivity, and service automation.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Updated {updatedAt}</span>
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {liveKpis.map((k) => (
            <KpiCard key={k.label} {...k} loading={refreshing || !summary} />
          ))}
        </section>

        {/* Case table */}
        <section>
          <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <h2 className="font-display text-xl font-bold">Most Recent Cases</h2>
              <div className="flex flex-wrap items-center gap-2">
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
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v as CaseStatus | "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-40" aria-label="Filter by status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {["Open", "Investigating", "Waiting for User", "Resolved", "Escalated"].map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={priority}
                  onValueChange={(v) => {
                    setPriority(v as Priority | "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-36" aria-label="Filter by priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {["Critical", "High", "Medium", "Low"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setSortAsc((v) => !v)}>
                  <ArrowUpDown className="size-4" /> {sortAsc ? "Oldest" : "Newest"}
                </Button>
              </div>
            </div>

            {refreshing ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center">
                <p className="font-semibold">No cases match your filters</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try clearing the search box or selecting a different status.
                </p>
                <Button
                  className="mt-4"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setPriority("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          "Ticket ID",
                          "Issue",
                          "Requester",
                          "Device / Asset",
                          "Location",
                          "Category",
                          "Priority",
                          "Status",
                          "Assigned To",
                          "Created",
                          "Actions",
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
                          onClick={() => setSelected(c)}
                        >
                          <TableCell className="font-semibold whitespace-nowrap">{c.id}</TableCell>
                          <TableCell className="max-w-56 truncate">{c.issue}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.requester}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.asset}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.location}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.category}</TableCell>
                          <TableCell>
                            <PriorityBadge priority={c.priority} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={c.status} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{c.assignedTo}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {c.created}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(c);
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 p-4 md:hidden">
                  {rows.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c)}
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
                      <p className="text-xs text-muted-foreground">{c.location}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <StatusBadge status={c.status} />
                        <span className="text-xs text-muted-foreground">{c.created}</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
                  <span className="text-muted-foreground">
                    Showing {(current - 1) * PAGE_SIZE + 1}–
                    {Math.min(current * PAGE_SIZE, filtered.length)} of the {filtered.length} most
                    recent · {summary?.tickets.total ?? 0} total
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
        </section>

        {/* Automation monitor - real counts from the simulated automation runs.
            The previous panels showed invented totals (4,318 devices, 1,942
            tags validated) that did not exist anywhere in GLPI. */}
        <section>
          <h2 className="font-display text-xl font-bold">Service Automation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Counted from the tickets the assistant opened and closed. The remote
            actions behind them (Workspace ONE ping, carrier reset) are simulated
            for this demo.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Automated runs", value: summary?.automation.totalRuns ?? 0 },
              { label: "Resolved without a technician", value: summary?.automation.autoResolved ?? 0 },
              { label: "Escalated to the service desk", value: summary?.automation.escalated ?? 0 },
              { label: "Cases with a linked asset", value: summary?.tickets.withAsset ?? 0 },
            ].map((m) => (
              <Card key={m.label} className="gap-0 rounded-xl p-5 shadow-card">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {m.label}
                </p>
                <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{m.value}</p>
              </Card>
            ))}
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            {[
              {
                key: "devices",
                title: "Field devices",
                subtitle: "Computers + Phones",
                value: summary?.devices.total ?? 0,
                note: `${summary?.devices.withGps ?? 0} with GPS coordinates`,
              },
              {
                key: "tags",
                title: "BTDS inventory tags",
                subtitle: "Assets carrying an inventory number",
                value: summary?.devices.tagged ?? 0,
                note: `${(summary?.devices.total ?? 0) - (summary?.devices.tagged ?? 0)} identified by name only`,
              },
              {
                key: "cases",
                title: "Cases in the queue",
                subtitle: "Open and closed",
                value: summary?.tickets.total ?? 0,
                note: `${summary?.tickets.open ?? 0} still open`,
              },
            ].map((panel) => {
              const Icon = automationIcons[panel.key as keyof typeof automationIcons];
              return (
                <Card key={panel.key} className="gap-0 rounded-xl p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-navy text-navy-foreground">
                      <Icon className="size-5" />
                    </span>
                    <div className="leading-tight">
                      <p className="font-bold">{panel.title}</p>
                      <p className="text-xs text-muted-foreground">{panel.subtitle}</p>
                    </div>
                  </div>
                  <p className="mt-4 font-display text-3xl font-extrabold tabular-nums">
                    {panel.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{panel.note}</p>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Analytics */}
        <section>
          <h2 className="font-display text-xl font-bold">Analytics</h2>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <ChartCard title="Cases by category">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={liveByCategory} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={54}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="value" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Cases by priority">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={livePriority}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {livePriority.map((_, i) => (
                        <Cell key={i} fill={chartColors[i % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 text-xs">
                {livePriority.map((p, i) => (
                  <span key={p.name} className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: chartColors[i % chartColors.length] }}
                    />
                    {p.name} · {p.value}
                  </span>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Fleet by device type">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={liveDeviceTypes}
                    layout="vertical"
                    margin={{ left: 30, right: 12 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      horizontal={false}
                    />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip cursor={{ fill: "var(--muted)" }} />
                    <Bar dataKey="value" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <Card className="gap-0 rounded-xl p-5 shadow-card lg:col-span-2">
              <h3 className="text-sm font-bold">Cases by station</h3>
              <div className="mt-4 space-y-3">
                {liveLocations.length ? (
                  liveLocations.map((l) => (
                    <div key={l.name}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{l.name}</span>
                        <span className="font-semibold tabular-nums">{l.value}</span>
                      </div>
                      <Progress value={(l.value / locationMax) * 100} className="mt-1.5 h-1.5" />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No station recorded on the current cases.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </section>
      </main>

      <Footer />

      <CaseDrawer caseItem={selected} onClose={() => setSelected(null)} onAct={act} />
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 rounded-xl p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>
      {children}
    </Card>
  );
}
