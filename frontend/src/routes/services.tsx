import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, LayoutGrid, Search, Wrench } from "lucide-react";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { PageHeader } from "@/components/fdny/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { memberNav } from "@/lib/nav";
import { useSessionUser } from "@/lib/session";
import { serviceCatalog, type ServiceCategory } from "@/lib/portal-data";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Service Catalog — Fire Department IT Service Portal" },
      {
        name: "description",
        content:
          "Browse the IT services available to field personnel: device recovery, carrier eSIM refresh, application support, access requests, and inventory validation.",
      },
      { property: "og:title", content: "Service Catalog — Fire Department IT Service Portal" },
      {
        property: "og:description",
        content: "Every IT service available to Fire Department field personnel, with response targets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

const categories: (ServiceCategory | "All")[] = [
  "All",
  "Field Devices",
  "Connectivity",
  "Applications",
  "Access & Identity",
  "Inventory",
];

const viaStyles: Record<string, string> = {
  "AI Assistant": "border-primary/30 bg-primary/10 text-primary",
  "Service Desk": "border-steel/30 bg-steel/10 text-steel",
  "Self-service": "border-success/30 bg-success/12 text-success",
};

function ServicesPage() {
  const { navUser } = useSessionUser();
  const [category, setCategory] = useState<ServiceCategory | "All">("All");
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return serviceCatalog.filter(
      (s) =>
        (category === "All" || s.category === category) &&
        (!q || `${s.name} ${s.summary} ${s.fulfillment}`.toLowerCase().includes(q)),
    );
  }, [category, query]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar theme="red" items={memberNav} user={navUser ?? { name: "Not signed in", initials: "--" }} />

      <PageHeader
        eyebrow="Service catalog"
        icon={LayoutGrid}
        title="What the service desk can do for you"
        description="Ten supported services covering field devices, connectivity, applications, access, and equipment records. Each one lists its response target and who fulfils it."
        actions={
          <Button asChild size="lg">
            <Link to="/report-ticket">
              <Wrench className="size-4" /> Start a request
            </Link>
          </Button>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services"
              className="w-64 pl-9"
              aria-label="Search services"
            />
          </div>
        </div>

        {results.length === 0 ? (
          <Card className="mt-8 gap-0 p-12 text-center shadow-card">
            <p className="font-semibold">No services match that search</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different term, or start a request and the assistant will route it.
            </p>
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setCategory("All");
                }}
              >
                Clear filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {results.map((s) => (
              <Card
                key={s.slug}
                className="group gap-0 rounded-xl p-6 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {s.category}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      viaStyles[s.requestVia],
                    )}
                  >
                    {s.requestVia}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-lg font-bold">{s.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.summary}</p>
                <dl className="mt-5 space-y-2 border-t pt-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="size-3.5" /> Target
                    </dt>
                    <dd className="text-right font-medium">{s.sla}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Fulfilled by</dt>
                    <dd className="text-right font-medium">{s.fulfillment}</dd>
                  </div>
                </dl>
                <Link
                  to="/report-ticket"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-steel"
                >
                  Request this service
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
