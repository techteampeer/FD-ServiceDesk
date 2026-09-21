import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LifeBuoy, Search, TicketPlus } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { PageHeader } from "@/components/fdny/PageHeader";
import { CaseDrawer } from "@/components/fdny/CaseDrawer";
import { PriorityBadge, StatusBadge } from "@/components/fdny/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { currentUser, serviceCases, type ServiceCase } from "@/lib/mock-data";
import { memberNav } from "@/lib/nav";
import { getMyTickets, type GlpiTicket } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { useRequireSession } from "@/lib/session";
import { useTicketVersion } from "@/lib/ticket-events";

export const Route = createFileRoute("/my-cases")({
  head: () => ({
    meta: [
      { title: "My Cases — FDNY IT Service Portal" },
      {
        name: "description",
        content:
          "Track the status, priority, and latest updates on every IT service request submitted by your unit.",
      },
      { property: "og:title", content: "My Cases — FDNY IT Service Portal" },
      {
        property: "og:description",
        content: "Status and history for the service requests your unit has submitted.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyCasesPage,
});

const tabs = ["Active", "Resolved", "All"] as const;
type Tab = (typeof tabs)[number];

// Mock cases are retained only as the fallback shape for the CaseDrawer;
// the list itself is now live GLPI data.
const myCases: ServiceCase[] = serviceCases.slice(0, 0);

/** GLPI status codes 5 (Solved) and 6 (Closed) count as resolved. */
const isResolved = (t: GlpiTicket) => t.status === 5 || t.status === 6;

function MyCasesPage() {
  const [tab, setTab] = useState<Tab>("Active");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ServiceCase | null>(null);

  // Real GLPI tickets where the signed-in member is the requester.
  const { navUser } = useRequireSession();
  // Read in an effect, not here: there is no localStorage during SSR and an
  // initializer that reads it breaks hydration.
  const [member, setMember] = useState<ReturnType<typeof getSessionUser>>(null);
  const [tickets, setTickets] = useState<GlpiTicket[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error" | "signed-out">("loading");
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever a ticket is created anywhere in the portal.
  const ticketVersion = useTicketVersion();

  useEffect(() => {
    const u = getSessionUser();
    setMember(u);
    if (!u) {
      setState("signed-out");
      return;
    }
    let cancelled = false;
    getMyTickets(u.id)
      .then((t) => {
        if (cancelled) return;
        setTickets(t);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load your tickets.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [ticketVersion]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      const inTab = tab === "All" || (tab === "Resolved" ? isResolved(t) : !isResolved(t));
      return (
        inTab &&
        (!q ||
          `${t.reference} ${t.name} ${t.asset?.name ?? ""} ${t.category ?? ""}`
            .toLowerCase()
            .includes(q))
      );
    });
  }, [tickets, tab, query]);

  const statusNote =
    state === "loading"
      ? "Loading your tickets from GLPI…"
      : state === "error"
        ? (error ?? "Your tickets could not be loaded.")
        : state === "signed-out"
          ? "Sign in to see your tickets."
          : null;

  const counts = {
    Active: tickets.filter((t) => !isResolved(t)).length,
    Resolved: tickets.filter(isResolved).length,
    All: tickets.length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        theme="red"
        items={memberNav}
        user={navUser ?? { name: "Not signed in", initials: "--" }}
      />

      <PageHeader
        eyebrow="My cases"
        icon={LifeBuoy}
        title="Your service requests"
        description={
          navUser
            ? `Service desk tickets where ${navUser.name} is the requester, live from GLPI.`
            : "Sign in to see the tickets you have submitted to the IT service desk."
        }
        actions={
          <Button asChild size="lg">
            <Link to="/report-ticket">
              <TicketPlus className="size-4" /> Report a new issue
            </Link>
          </Button>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  tab === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t} · {counts[t]}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your cases"
              className="w-60 pl-9"
              aria-label="Search your cases"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <Card className="mt-8 gap-0 p-12 text-center shadow-card">
            <p className="font-semibold">Nothing here right now</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusNote ?? "No cases match this view. Report an issue and it will appear here immediately."}
            </p>
            <div className="mt-4">
              <Button asChild>
                <Link to="/report-ticket">
                  <TicketPlus className="size-4" /> Report an issue
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="mt-8 space-y-4">
            {rows.map((t) => (
              <Card
                key={t.id}
                className="gap-0 rounded-xl p-5 shadow-card transition-shadow hover:shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {t.reference} · GLPI #{t.id}
                      {t.category ? ` · ${t.category}` : ""}
                    </p>
                    <h2 className="mt-1 font-display text-lg font-bold">{t.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.asset
                        ? `${t.asset.name ?? "Linked asset"}${t.asset.assetTag ? ` · ${t.asset.assetTag}` : ""}${t.asset.type || t.asset.itemType ? ` · ${t.asset.type ?? t.asset.itemType}` : ""}`
                        : "No equipment linked"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                      {t.urgencyLabel}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        isResolved(t)
                          ? "border-success/30 bg-success/12 text-success"
                          : "border-steel/30 bg-steel/10 text-steel",
                      )}
                    >
                      {t.statusLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
                  <span className="text-muted-foreground">
                    {t.date ? `Opened ${t.date}` : "Opened date unavailable"}
                    {t.assignedTo ? ` · assigned to ${t.assignedTo.name}` : " · unassigned"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />

      <CaseDrawer
        caseItem={selected}
        onClose={() => setSelected(null)}
        // Comment / photo / close were toast-only and claimed the service desk
        // had been notified, so the drawer is read-only.
        onAct={() => {}}
      />
    </div>
  );
}
