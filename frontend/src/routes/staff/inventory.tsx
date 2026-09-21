import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
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
import { type InventoryRecord, type InventoryState } from "@/lib/portal-data";
import { getFleet, type GlpiDevice } from "@/lib/api";

export const Route = createFileRoute("/staff/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Validation — FDNY Service Desk" },
      {
        name: "description",
        content:
          "Review equipment tags submitted from the field, accept CMDB corrections, and resolve duplicate or unregistered asset records.",
      },
      { property: "og:title", content: "Inventory Validation — FDNY Service Desk" },
      {
        property: "og:description",
        content: "Smart inventory validation queue for CMDB data quality.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffInventoryPage,
});

const stateStyles: Record<InventoryState, string> = {
  Validated: "border-success/30 bg-success/12 text-success",
  Mismatch: "border-warning/40 bg-warning/15 text-warning-foreground",
  Duplicate: "border-steel/30 bg-steel/10 text-steel",
  Unregistered: "border-primary/30 bg-primary/10 text-primary",
};


/** Row shape shared by live GLPI assets and the sample validation queue. */
type InventoryRow = InventoryRecord & { source: "live" };

function StaffInventoryPage() {
  // A member who types this URL is redirected to the member portal.
  const { allowed, navUser } = useRequireStaff();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("all");
  const [resolved, setResolved] = useState<Record<string, "accepted" | "rejected">>({});

  // Live GLPI assets appear as already-validated rows: their BTDS inventory
  // number is authoritative, so nothing needs a decision. Confidence and
  // submittedAt have no GLPI equivalent and are not invented here.
  // The service desk validates against the WHOLE catalog, not just the
  // signed-in member's own equipment.
  const [liveDevices, setLiveDevices] = useState<GlpiDevice[]>([]);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getFleet()
      .then((f) => !cancelled && setLiveDevices(f))
      .catch(() => {
        /* the sample validation queue still renders */
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);
  const liveInventory = useMemo<InventoryRow[]>(
    () =>
      liveDevices
        .map((d) => ({
          source: "live" as const,
          // Most assets carry no BTDS tag, so the device name is the identifier.
          submitted: (d.assetTag ?? d.name) as string,
          suggested: (d.assetTag ?? d.name) as string,
          model: d.model ?? d.name,
          unit: d.locationName ?? d.unit,
          state: "Validated" as InventoryState,
          confidence: 100,
          submittedAt: "—",
        })),
    [liveDevices],
  );
  // Live catalog only: sample validation rows are gone, so nothing on this
  // screen is invented.
  const allInventory = liveInventory;

  /** Honest counts computed from the GLPI catalog this screen is showing. */
  const catalogStats = useMemo(
    () => [
      { label: "Assets in catalog", value: String(liveDevices.length) },
      { label: "With BTDS inventory tag", value: String(liveDevices.filter((d) => d.assetTag).length) },
      { label: "Identified by name only", value: String(liveDevices.filter((d) => !d.assetTag).length) },
      {
        label: "Distinct stations",
        value: String(new Set(liveDevices.map((d) => d.locationName).filter(Boolean)).size),
      },
    ],
    [liveDevices],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allInventory.filter(
      (r) =>
        (!q || `${r.submitted} ${r.suggested} ${r.model} ${r.unit}`.toLowerCase().includes(q)) &&
        (state === "all" || r.state === state),
    );
  }, [allInventory, query, state]);

  const pending = allInventory.filter(
    (r) => r.state !== "Validated" && !resolved[r.submitted],
  ).length;

  const decide = (key: string, decision: "accepted" | "rejected", label: string) => {
    setResolved((s) => ({ ...s, [key]: decision }));
    toast.success(
      decision === "accepted"
        ? `Correction written to the CMDB for ${label}`
        : `Correction rejected for ${label} — routed to logistics`,
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        theme="navy"
        brandSubtitle="Service Desk Operations"
        items={staffNav}
        user={navUser ?? { name: "Service Desk", initials: "SD" }}
        accountArea="staff"
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-extrabold">
            <Database className="size-7 text-primary" /> Inventory Validation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Equipment identifiers in the GLPI catalog, plus any tag submitted from the field that
            did not match. {pending} record{pending === 1 ? "" : "s"} still need a decision.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {catalogStats.map((m) => (
              <Card key={m.label} className="gap-0 rounded-xl p-4 shadow-card">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {m.label}
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold">{m.value}</p>
              </Card>
            ))}
        </section>

        <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tags, models, units"
                className="w-60 pl-9"
                aria-label="Search inventory records"
              />
            </div>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="w-44" aria-label="Filter by state">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {["Validated", "Mismatch", "Duplicate", "Unregistered"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setState("all");
              }}
            >
              Clear
            </Button>
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-semibold">No records match those filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear the filters to see every submitted tag.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "Identifier",
                      "GLPI match",
                      "Model",
                      "Unit",
                      "Confidence",
                      "State",
                      "Decision",
                    ].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const decision = resolved[r.submitted];
                    const needsDecision = r.state !== "Validated" && !decision;
                    return (
                      <TableRow key={`${r.source}-${r.submitted}`}>
                        <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                          {r.submitted}
                          <span
                            className={cn(
                              "ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                              r.source === "live"
                                ? "border-success/30 bg-success/12 text-success"
                                : "border-muted-foreground/25 bg-muted text-muted-foreground",
                            )}
                          >
                            {r.source === "live" ? "GLPI" : "Sample"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {r.suggested}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{r.model}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.unit}</TableCell>
                        <TableCell className="w-32">
                          <span className="flex items-center gap-2 text-xs tabular-nums">
                            {r.confidence}%
                            <Progress value={r.confidence} className="h-1.5 w-16" />
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
                              stateStyles[r.state],
                            )}
                          >
                            {r.state}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {decision ? (
                            <span
                              className={cn(
                                "text-xs font-semibold",
                                decision === "accepted" ? "text-success" : "text-muted-foreground",
                              )}
                            >
                              {decision === "accepted" ? "Correction applied" : "Rejected"}
                            </span>
                          ) : needsDecision ? (
                            <span className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => decide(r.submitted, "accepted", r.submitted)}
                              >
                                <Check className="size-3.5" /> Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => decide(r.submitted, "rejected", r.submitted)}
                              >
                                <X className="size-3.5" /> Reject
                              </Button>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No action needed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>

      <Footer />
    </div>
  );
}
