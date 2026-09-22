import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2, Search, Ticket, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { DeviceMap } from "@/components/fdny/DeviceMap";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { staffNav } from "@/lib/nav";
import { useRequireStaff } from "@/lib/session";
import { bumpTickets } from "@/lib/ticket-events";
import {
  getUserDevices,
  reportTicket,
  searchUsers,
  type GlpiDevice,
  type GlpiUserMatch,
  type ReportTicketResult,
} from "@/lib/api";

export const Route = createFileRoute("/staff/report-for")({
  head: () => ({
    meta: [
      { title: "Report for a Member — FDNY Service Desk" },
      {
        name: "description",
        content:
          "Service-desk intake: find a GLPI user, load their assigned equipment and raise a real GLPI ticket on their behalf.",
      },
    ],
  }),
  component: ReportForPage,
});

const CATEGORIES = [
  "Hardware",
  "Connectivity",
  "Lost or Stolen",
  "Asset Management",
  "Device Recovery",
];

const URGENCY = [
  { label: "Critical", value: 5 },
  { label: "High", value: 4 },
  { label: "Medium", value: 3 },
  { label: "Low", value: 2 },
];

function ReportForPage() {
  const { allowed, navUser } = useRequireStaff();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<GlpiUserMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [member, setMember] = useState<GlpiUserMatch | null>(null);
  const [devices, setDevices] = useState<GlpiDevice[]>([]);
  const [devicesState, setDevicesState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [category, setCategory] = useState("Hardware");
  const [urgency, setUrgency] = useState(3);
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<ReportTicketResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Devices are ALWAYS the confirmed member's, re-read whenever that changes,
  // so equipment from a previously searched person can never carry over.
  useEffect(() => {
    if (!member) {
      setDevices([]);
      setSelectedId(null);
      setDevicesState("idle");
      return;
    }
    let cancelled = false;
    setDevicesState("loading");
    setDevices([]);
    setSelectedId(null);
    getUserDevices(member.id)
      .then((list) => {
        if (cancelled) return;
        setDevices(list);
        setSelectedId(list[0]?.id ?? null);
        setDevicesState("ready");
      })
      .catch(() => !cancelled && setDevicesState("error"));
    return () => {
      cancelled = true;
    };
  }, [member]);

  const selected = devices.find((d) => d.id === selectedId) ?? null;

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchError("Enter at least two characters of a login, employee number or email.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchUsers(q);
      setMatches(found);
      if (!found.length) setSearchError("No GLPI user in the FDNY entity matches that.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "The search failed.");
      setMatches(null);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!member) return;
    const text = [summary.trim(), detail.trim()].filter(Boolean).join("\n\n");
    if (!text) {
      setSubmitError("Describe the issue before raising the ticket.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await reportTicket({
        title: selected
          ? `[${selected.assetTag ?? selected.name}] ${summary.trim() || category}`
          : summary.trim() || category,
        text,
        category,
        urgency,
        // The member stays the GLPI requester; the backend records the operator.
        userId: member.id,
        device: selected,
      });
      setCreated(result);
      bumpTickets();
      toast.success(`${result.ticketId} raised for ${member.displayName}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not create the ticket.");
      toast.error("Could not create the ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    setCreated(null);
    setMember(null);
    setMatches(null);
    setQuery("");
    setSummary("");
    setDetail("");
    setSubmitError(null);
  };

  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        theme="navy"
        brandSubtitle="Service Desk Operations"
        items={staffNav}
        user={navUser ?? { name: "Service desk", initials: "SD" }}
        accountArea="staff"
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-extrabold">
            <UserRound className="size-7 text-primary" /> Report for a member
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Take a call, find the member in GLPI, load their assigned equipment and raise a real
            GLPI ticket in their name.
          </p>
        </header>

        {created ? (
          <Card className="gap-0 rounded-xl p-6 shadow-card">
            <p className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
              <CheckCircle2 className="size-5 text-success" /> {created.ticketId}
            </p>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <Field label="Requester in GLPI" value={member?.displayName ?? "—"} />
              <Field label="Status in GLPI" value={created.status} />
              <Field
                label="Linked asset"
                value={
                  created.assetLinked
                    ? `${selected?.name ?? "asset"} (${selected?.type ?? created.assetItemType ?? "—"})`
                    : "No device linked"
                }
              />
              <Field label="Category" value={category} />
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              The member sees this in My Cases; the desk sees it in the case queue.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link to="/staff/cases">Open the case queue</Link>
              </Button>
              <Button variant="ghost" onClick={startOver}>
                Report for someone else
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* 1 - find the member */}
            <Card className="gap-0 rounded-xl p-6 shadow-card">
              <h2 className="font-display text-lg font-bold">1 · Find the member</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search GLPI by login, employee/badge number, name or email.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="relative min-w-60 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runSearch();
                      }
                    }}
                    placeholder="e.g. 900103, tlindqvist, or an @fdny address"
                    aria-label="Search GLPI users"
                  />
                </div>
                <Button onClick={runSearch} disabled={searching}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  Search GLPI
                </Button>
              </div>
              {searchError ? <p className="mt-3 text-sm text-primary">{searchError}</p> : null}

              {matches?.length ? (
                <ul className="mt-4 space-y-2">
                  {matches.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setMember(u)}
                        className={cn(
                          "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                          member?.id === u.id ? "border-steel bg-steel/10" : "hover:bg-muted",
                        )}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{u.displayName}</span>
                          <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {u.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          GLPI user {u.id} · login {u.login}
                          {u.employeeId ? ` · employee ${u.employeeId}` : ""}
                          {u.email ? ` · ${u.email}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>

            {/* 2 - their equipment */}
            {member ? (
              <Card className="gap-0 rounded-xl p-6 shadow-card">
                <h2 className="font-display text-lg font-bold">
                  2 · {member.displayName}&rsquo;s equipment
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {devicesState === "loading"
                    ? "Reading their assigned assets from GLPI…"
                    : devicesState === "error"
                      ? "Their equipment could not be read from GLPI."
                      : devices.length
                        ? `${devices.length} asset${devices.length === 1 ? "" : "s"} assigned to them in GLPI.`
                        : "GLPI has no equipment assigned to this member. A ticket can still be raised without an asset."}
                </p>

                {devices.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {devices.map((d) => (
                      <button
                        key={`${d.itemType}-${d.id}`}
                        type="button"
                        onClick={() => setSelectedId(d.id)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left transition-colors",
                          selectedId === d.id ? "border-steel bg-steel/10" : "hover:bg-muted",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{d.name}</span>
                          <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {d.type ?? d.itemType}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[d.model, d.assetTag].filter(Boolean).join(" · ") || "No inventory tag"}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground/80">
                          {d.locationName ?? "No location"}
                          {d.status ? ` · ${d.status}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* Keyed to the asset, so the map can never show the previous one. */}
                {selected?.latitude && selected?.longitude ? (
                  <DeviceMap
                    key={`onbehalf-${selected.itemType}-${selected.id}-${selected.latitude},${selected.longitude}`}
                    latitude={selected.latitude}
                    longitude={selected.longitude}
                    label={`${selected.name} (${selected.type ?? selected.itemType})`}
                    locationName={selected.locationName}
                  />
                ) : null}
              </Card>
            ) : null}

            {/* 3 - the issue */}
            {member ? (
              <Card className="gap-0 rounded-xl p-6 shadow-card">
                <h2 className="font-display text-lg font-bold">3 · The issue</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-semibold">Category</span>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block text-sm">
                    <span className="font-semibold">Urgency</span>
                    <Select value={String(urgency)} onValueChange={(v) => setUrgency(Number(v))}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="Urgency" />
                      </SelectTrigger>
                      <SelectContent>
                        {URGENCY.map((u) => (
                          <SelectItem key={u.value} value={String(u.value)}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
                <label className="mt-4 block text-sm">
                  <span className="font-semibold">Summary</span>
                  <Input
                    className="mt-1"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Short title for the ticket"
                  />
                </label>
                <label className="mt-4 block text-sm">
                  <span className="font-semibold">What the member reported</span>
                  <Textarea
                    className="mt-1 min-h-28"
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="What they described on the call"
                  />
                </label>

                {submitError ? <p className="mt-3 text-sm text-primary">{submitError}</p> : null}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button onClick={submit} disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Creating in GLPI…
                      </>
                    ) : (
                      <>
                        <Ticket className="size-4" /> Raise the GLPI ticket
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setMember(null)}>
                    <ArrowLeft className="size-4" /> Pick a different member
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {member.displayName} is recorded as the GLPI requester; you are recorded as the
                  operator who took the call.
                </p>
              </Card>
            ) : null}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
