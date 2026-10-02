import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Clock, Eye, Search } from "lucide-react";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { PageHeader } from "@/components/fdny/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { memberNav } from "@/lib/nav";
import { useSessionUser } from "@/lib/session";
import { kbArticles, type KbArticle, type ServiceCategory } from "@/lib/portal-data";

export const Route = createFileRoute("/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — Fire Department IT Service Portal" },
      {
        name: "description",
        content:
          "Step-by-step guides for field tablets, FirstNet and Verizon connectivity, ePCR application issues, equipment tags, and account access.",
      },
      { property: "og:title", content: "Knowledge Base — Fire Department IT Service Portal" },
      {
        property: "og:description",
        content: "Self-service guides for the technology crews depend on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeBasePage,
});

const categories: (ServiceCategory | "All")[] = [
  "All",
  "Field Devices",
  "Connectivity",
  "Applications",
  "Access & Identity",
  "Inventory",
];

function KnowledgeBasePage() {
  const { navUser } = useSessionUser();
  const [category, setCategory] = useState<ServiceCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<KbArticle | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kbArticles.filter(
      (a) =>
        (category === "All" || a.category === category) &&
        (!q || `${a.title} ${a.summary}`.toLowerCase().includes(q)),
    );
  }, [category, query]);

  const popular = [...kbArticles].sort((a, b) => b.views - a.views).slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <Navbar theme="red" items={memberNav} user={navUser ?? { name: "Not signed in", initials: "--" }} />

      <PageHeader
        eyebrow="Knowledge base"
        icon={BookOpen}
        title="Fix it yourself, in a few steps"
        description="Short guides written for the firehouse, not the data centre. Each one takes under six minutes and covers the checks the service desk would ask for anyway."
      />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <section aria-label="Most read">
          <h2 className="font-display text-xl font-bold">Most read this week</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {popular.map((a) => (
              <button
                key={a.slug}
                type="button"
                onClick={() => setOpen(a)}
                className="rounded-xl border-t-4 border-t-primary bg-card p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift"
              >
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {a.category}
                </p>
                <p className="mt-2 font-display text-base font-bold">{a.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{a.summary}</p>
                <p className="mt-4 inline-flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" /> {a.readTime}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="size-3.5" /> {a.views.toLocaleString()}
                  </span>
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-12">
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
                placeholder="Search articles"
                className="w-64 pl-9"
                aria-label="Search articles"
              />
            </div>
          </div>

          {results.length === 0 ? (
            <Card className="mt-8 gap-0 p-12 text-center shadow-card">
              <p className="font-semibold">No article covers that yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask the AI assistant — it can troubleshoot live and open a ticket if needed.
              </p>
              <div className="mt-4">
                <Button asChild>
                  <Link to="/report-ticket">Ask the assistant</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="mt-6 divide-y rounded-xl border bg-card shadow-card">
              {results.map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => setOpen(a)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="max-w-2xl">
                    <span className="block font-semibold">{a.title}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{a.summary}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2.5 py-1 font-semibold uppercase">
                      {a.category}
                    </span>
                    <span>{a.readTime}</span>
                    <span>Updated {a.updated}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />

      <Sheet open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader className="gap-1">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {open.category} · {open.readTime} read
                </p>
                <SheetTitle className="font-display text-xl font-extrabold">
                  {open.title}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">{open.summary}</p>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-8">
                <ol className="space-y-4">
                  {open.steps.map((step, i) => (
                    <li key={step} className="flex gap-3 text-sm">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-foreground/85">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Still stuck after these steps? The assistant can run the same diagnostics the
                  service desk would.
                </div>
                <Button asChild className="w-full">
                  <Link to="/report-ticket">Open the AI Service Assistant</Link>
                </Button>
                <p className="text-xs text-muted-foreground">Last updated {open.updated}</p>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
