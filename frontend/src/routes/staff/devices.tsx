import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BatteryMedium, MapPin, RefreshCw, Search, Smartphone } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { staffNav } from "@/lib/nav";
import { useRequireStaff } from "@/lib/session";
import { staffUser } from "@/lib/mock-data";
import { type DeviceHealth } from "@/lib/portal-data";
import { getFleet, type GlpiDevice } from "@/lib/api";
import { toDeviceRow, useLiveLocation, type DeviceRow } from "@/lib/use-live-devices";

export const Route = createFileRoute("/staff/devices")({
  head: () => ({
    meta: [
      { title: "Field Devices — Fire Department Service Desk" },
      {
        name: "description",
        content:
          "Enrolled field device fleet: health, carrier, battery, last check-in, assigned station and simulated remote actions.",
      },
      { property: "og:title", content: "Field Devices — Fire Department Service Desk" },
      {
        property: "og:description",
        content: "Monitor the enrolled tablet, MDT, and station device fleet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffDevicesPage,
});

const healthStyles: Record<DeviceHealth, string> = {
  Online: "border-success/30 bg-success/12 text-success",
  Offline: "border-primary/30 bg-primary/10 text-primary",
  "Needs Attention": "border-warning/40 bg-warning/15 text-warning-foreground",
};


const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

function StaffDevicesPage() {
  // A member who types this URL is redirected to the member portal.
  const { allowed, navUser } = useRequireStaff();
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState("all");
  const [type, setType] = useState("all");

  const [selected, setSelected] = useState<DeviceRow | null>(null);
  const [busy, setBusy] = useState(false);

  // The whole FDNY fleet from GLPI: Computers and Phones. No sample rows - the
  // live data covers every asset the demo has.
  const [liveDevices, setLiveDevices] = useState<GlpiDevice[]>([]);
  const [liveState, setLiveState] = useState<"loading" | "ready" | "error">("loading");
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getFleet()
      .then((f) => {
        if (cancelled) return;
        setLiveDevices(f);
        setLiveState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLiveError(e instanceof Error ? e.message : "Could not load the fleet.");
        setLiveState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const allRows = useMemo<DeviceRow[]>(() => liveDevices.map(toDeviceRow), [liveDevices]);

  const types = useMemo(() => Array.from(new Set(allRows.map((d) => d.type))), [allRows]);
  // GLPI state names ("In use", "In repair", ...), not invented MDM words -
  // the hardcoded list matched no row, so the filter returned nothing.
  const healths = useMemo(
    () => Array.from(new Set(allRows.map((d) => d.health).filter(Boolean) as string[])).sort(),
    [allRows],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter(
      (d) =>
        (!q ||
          `${d.tag} ${d.name} ${d.model} ${d.unit} ${d.carrier ?? ""} ${d.status ?? ""}`
            .toLowerCase()
            .includes(q)) &&
        (health === "all" || d.health === health) &&
        (type === "all" || d.type === type),
    );
  }, [allRows, query, health, type]);

  // Authoritative location detail for the selected live asset.
  const selectedLocation = useLiveLocation(
    selected?.source === "live" ? selected.locationId : null,
  );

  // Health telemetry needs an MDM feed we do not have, so the tiles show real
  // catalog facts instead of three permanent zeroes.
  const counts = {
    total: allRows.length,
    computers: liveDevices.filter((d) => d.itemType === "Computer").length,
    phones: liveDevices.filter((d) => d.itemType === "Phone").length,
    tagged: liveDevices.filter((d) => d.assetTag).length,
  };

  // Simulated: nothing is sent to an MDM or a carrier, so say so rather than
  // reporting a delivered command.
  const run = (label: string) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      toast.info(
        `${label} simulated for ${selected?.tag ?? "this device"} — no MDM or carrier was contacted.`,
      );
    }, 900);
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
        <header>
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-extrabold">
            <Smartphone className="size-7 text-primary" /> Field Devices
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fire Department equipment in the GLPI asset catalog, with the simulated remote actions the service desk can run
            without dispatching a technician.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Assets in catalog" value={counts.total} tone="muted" />
          <Stat label="Computer records" value={counts.computers} tone="success" />
          <Stat label="Phone records" value={counts.phones} tone="muted" />
          <Stat label="With BTDS tag" value={counts.tagged} tone="primary" />
        </section>

        <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-card">
          <div className="flex flex-wrap items-center gap-2 border-b p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tag, model, unit"
                className="w-56 pl-9"
                aria-label="Search devices"
              />
            </div>
            <Picker
              label="Health"
              value={health}
              onChange={setHealth}
              options={healths}
              allLabel="All states"
            />
            <Picker
              label="Type"
              value={type}
              onChange={setType}
              options={types}
              allLabel="All types"
            />
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setHealth("all");
                setType("all");
              }}
            >
              Clear
            </Button>
          </div>

          {/* Live-data state. Rows marked GLPI come from the backend; the rest is
              sample fleet data kept until a fleet-wide endpoint exists. */}
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            {liveState === "loading"
              ? "Loading the GLPI asset catalog…"
              : liveState === "error"
                ? `Live GLPI assets unavailable: ${liveError ?? "request failed"}.`
                : liveDevices.length === 0
                  ? "No assets found in the GLPI catalog."
                  : `${liveDevices.length} assets from GLPI · ${liveDevices.filter((d) => d.itemType === "Computer").length} Computers, ${liveDevices.filter((d) => d.itemType === "Phone").length} Phones.`}
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center">
              <p className="font-semibold">No devices match those filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear a filter to widen the fleet view.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Borough, carrier, battery and check-in are MDM fields GLPI
                        does not hold, so they were blank on every row. They stay
                        in the detail panel, which explains why they are empty. */}
                    {["Asset", "Model", "Type", "Unit", "Health"].map((h) => (
                      <TableHead key={h} className="whitespace-nowrap">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow
                      key={`${d.source}-${d.glpiId ?? d.tag}`}
                      className="cursor-pointer"
                      onClick={() => setSelected(d)}
                    >
                      <TableCell className="font-semibold whitespace-nowrap">
                        {d.tag}
                        <span
                          className={cn(
                            "ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                            d.source === "live"
                              ? "border-success/30 bg-success/12 text-success"
                              : "border-muted-foreground/25 bg-muted text-muted-foreground",
                          )}
                        >
                          {d.source === "live" ? "GLPI" : "Sample"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{dash(d.model)}</TableCell>
                      <TableCell className="whitespace-nowrap">{d.type}</TableCell>
                      <TableCell className="whitespace-nowrap">{dash(d.unit)}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
                            d.health
                              ? healthStyles[d.health as DeviceHealth]
                              : "border-steel/30 bg-steel/10 text-steel",
                          )}
                        >
                          {d.health ?? dash(d.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>

      <Footer />

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader className="gap-1">
                <SheetTitle className="font-display text-xl font-extrabold">
                  {selected.tag}
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {selected.model} · {selected.type}
                </p>
                <span
                  className={cn(
                    "mt-2 w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    selected.health
                      ? healthStyles[selected.health as DeviceHealth]
                      : "border-steel/30 bg-steel/10 text-steel",
                  )}
                >
                  {selected.health ?? dash(selected.status)}
                </span>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-8">
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <Field label="Assigned unit" value={dash(selected.unit)} />
                  {selected.source === "live" ? (
                    <>
                      <Field label="Device name" value={selected.name} />
                      <Field label="Inventory tag (BTDS)" value={dash(selected.tag)} />
                      <Field label="GLPI status" value={dash(selected.status)} />
                      <Field
                        label="Station"
                        value={dash(selectedLocation?.name ?? selected.unit)}
                      />
                      <Field
                        label="Address"
                        value={dash(
                          [selectedLocation?.["address"], selectedLocation?.["town"]]
                            .filter(Boolean)
                            .join(", ") || null,
                        )}
                      />
                      <Field
                        label="GPS"
                        value={dash(
                          (() => {
                            const lat = selectedLocation?.latitude ?? selected.latitude;
                            const lon = selectedLocation?.longitude ?? selected.longitude;
                            return lat && lon ? `${lat}, ${lon}` : null;
                          })(),
                        )}
                      />
                    </>
                  ) : null}
                  <Field label="Borough" value={dash(selected.borough)} />
                  <Field label="Carrier" value={dash(selected.carrier)} />
                  <Field label="OS / firmware" value={dash(selected.osVersion)} />
                  <Field
                    label="Battery"
                    value={selected.battery === null ? "—" : `${selected.battery}%`}
                  />
                  <Field label="Last check-in" value={dash(selected.lastCheckIn)} />
                </dl>

                {selected.source === "live" ? (
                  <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
                    Carrier, battery, OS and check-in telemetry need an MDM/EMM integration and are
                    not available from GLPI — shown as “—” for this live asset. The remote actions
                    below are still simulated.
                  </p>
                ) : null}

                <div className="rounded-lg border bg-steel/6 p-3 text-sm text-foreground/85">
                  <MapPin className="mr-1.5 inline size-4" />
                  {selected.source === "live"
                    ? `Assigned location from GLPI: ${dash(selected.unit)}.`
                    : `Last reported inside the ${dash(selected.borough)} coverage area at ${dash(
                        selected.lastCheckIn,
                      )}. Location accuracy depends on the device checking in.`}
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Remote actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run("eSIM refresh")}
                    >
                      <RefreshCw className={cn("size-4", busy && "animate-spin")} /> eSIM refresh
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run("Battery report")}
                    >
                      <BatteryMedium className="size-4" /> Battery report
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "success" | "warning" | "primary";
}) {
  const tones = {
    muted: "text-foreground",
    success: "text-success",
    warning: "text-warning-foreground",
    primary: "text-primary",
  };
  return (
    <Card className="gap-0 rounded-xl p-5 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-3 font-display text-3xl font-extrabold tabular-nums", tones[tone])}>
        {value}
      </p>
    </Card>
  );
}

function Picker({
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
