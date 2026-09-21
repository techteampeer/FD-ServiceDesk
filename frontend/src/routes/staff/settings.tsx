import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
import { signOutMock } from "@/lib/auth";
import { staffNav } from "@/lib/nav";
import { useRequireStaff } from "@/lib/session";
import { automationPanels, staffUser } from "@/lib/mock-data";

export const Route = createFileRoute("/staff/settings")({
  head: () => ({
    meta: [
      { title: "Service Desk Settings — FDNY Portal" },
      {
        name: "description",
        content:
          "Queue defaults, alert thresholds, automation controls, and integration status for the concept service desk.",
      },
      { property: "og:title", content: "Service Desk Settings — FDNY Portal" },
      {
        property: "og:description",
        content: "Configure queue defaults, alerting, and the service automations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffSettingsPage,
});

const automationToggles = [
  {
    key: "sound-ping",
    label: "Self-service sound ping",
    hint: "Let members trigger a sound ping from the assistant without a technician.",
    initial: true,
  },
  {
    key: "esim",
    label: "Automatic eSIM refresh",
    hint: "Attempt a carrier re-provision before creating a connectivity case.",
    initial: true,
  },
  {
    key: "cmdb",
    label: "CMDB tag auto-correction",
    hint: "Write high-confidence corrections back without a reviewer.",
    initial: false,
  },
  {
    key: "triage",
    label: "AI priority suggestion",
    hint: "Let the assistant propose a priority on new cases.",
    initial: true,
  },
];

const alertToggles = [
  {
    key: "critical",
    label: "Page on Critical cases",
    hint: "SMS the on-call technician immediately.",
    initial: true,
  },
  {
    key: "unassigned",
    label: "Unassigned case reminder",
    hint: "Alert when a case sits unassigned for 30 minutes.",
    initial: true,
  },
  {
    key: "carrier",
    label: "Carrier failure escalation",
    hint: "Notify the carrier liaison after two failed refreshes.",
    initial: true,
  },
  {
    key: "digest",
    label: "End-of-shift digest",
    hint: "Summary of the queue at each tour change.",
    initial: false,
  },
];

const integrations = [
  {
    name: "Workspace ONE UEM",
    scope: "Device enrolment, location, sound ping",
    status: "Connected",
    synced: "Sep 18 · 08:22",
  },
  {
    name: "FirstNet Carrier API",
    scope: "eSIM provisioning and diagnostics",
    status: "Connected",
    synced: "Sep 18 · 08:19",
  },
  {
    name: "Verizon Carrier API",
    scope: "eSIM provisioning and diagnostics",
    status: "Degraded",
    synced: "Sep 18 · 06:33",
  },
  {
    name: "CMDB Asset Catalog",
    scope: "Equipment tag validation",
    status: "Connected",
    synced: "Sep 18 · 08:00",
  },
  {
    name: "CAD Dispatch Bridge",
    scope: "Unit and incident context",
    status: "Connected",
    synced: "Sep 18 · 08:21",
  },
];

function StaffSettingsPage() {
  // A member who types this URL is redirected to the member portal.
  const { allowed, navUser } = useRequireStaff();
  const navigate = useNavigate();
  const [automation, setAutomation] = useState<Record<string, boolean>>(
    Object.fromEntries(automationToggles.map((t) => [t.key, t.initial])),
  );
  const [alerts, setAlerts] = useState<Record<string, boolean>>(
    Object.fromEntries(alertToggles.map((t) => [t.key, t.initial])),
  );
  const [queue, setQueue] = useState("mine");
  const [pageSize, setPageSize] = useState("8");

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        theme="navy"
        brandSubtitle="Service Desk Operations"
        items={staffNav}
        user={navUser ?? { name: "Service Desk", initials: "SD" }}
        accountArea="staff"
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-extrabold">
            <Settings2 className="size-7 text-primary" /> Service Desk Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {staffUser.name} · {staffUser.role}
          </p>
        </header>

        <Card className="gap-0 rounded-xl p-6 shadow-card">
          <h2 className="font-display text-xl font-bold">Queue defaults</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="queue">Open the queue filtered to</Label>
              <Select value={queue} onValueChange={setQueue}>
                <SelectTrigger id="queue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">Cases assigned to me</SelectItem>
                  <SelectItem value="unassigned">Unassigned cases</SelectItem>
                  <SelectItem value="escalated">Escalated cases</SelectItem>
                  <SelectItem value="all">Everything</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-size">Rows per page</Label>
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger id="page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["6", "8", "12", "25"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="gap-0 rounded-xl p-6 shadow-card">
          <h2 className="font-display text-xl font-bold">Automations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What the portal is allowed to do before a technician gets involved.
          </p>
          <div className="mt-5 divide-y">
            {automationToggles.map((t) => (
              <Row
                key={t.key}
                label={t.label}
                hint={t.hint}
                checked={automation[t.key] ?? false}
                onChange={(v) => setAutomation((s) => ({ ...s, [t.key]: v }))}
              />
            ))}
          </div>
          <Separator className="my-6" />
          <div className="grid gap-3 sm:grid-cols-3">
            {automationPanels.map((p) => (
              <div key={p.key} className="rounded-lg border p-4">
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.subtitle}</p>
                <p
                  className={
                    p.health === "Operational"
                      ? "mt-2 text-xs font-semibold text-success"
                      : "mt-2 text-xs font-semibold text-warning-foreground"
                  }
                >
                  {p.health}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="gap-0 rounded-xl p-6 shadow-card">
          <h2 className="font-display text-xl font-bold">Alerting</h2>
          <div className="mt-5 divide-y">
            {alertToggles.map((t) => (
              <Row
                key={t.key}
                label={t.label}
                hint={t.hint}
                checked={alerts[t.key] ?? false}
                onChange={(v) => setAlerts((s) => ({ ...s, [t.key]: v }))}
              />
            ))}
          </div>
        </Card>

        <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-card">
          <div className="border-b p-5">
            <h2 className="font-display text-xl font-bold">Integrations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Systems this portal reads from and writes to.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {["System", "Scope", "Status", "Last sync"].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {integrations.map((i) => (
                  <TableRow key={i.name}>
                    <TableCell className="font-semibold whitespace-nowrap">{i.name}</TableCell>
                    <TableCell className="text-muted-foreground">{i.scope}</TableCell>
                    <TableCell>
                      <span
                        className={
                          i.status === "Connected"
                            ? "rounded-full border border-success/30 bg-success/12 px-2.5 py-0.5 text-xs font-semibold text-success"
                            : "rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground"
                        }
                      >
                        {i.status}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {i.synced}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => {
              signOutMock();
              toast.success("Signed out of the portal");
              navigate({ to: "/login" });
            }}
          >
            Sign out
          </Button>
          <Button onClick={() => toast.success("Service desk settings saved")}>
            Save settings
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
