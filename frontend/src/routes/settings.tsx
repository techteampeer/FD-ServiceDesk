import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { PageHeader } from "@/components/fdny/PageHeader";
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
import { signOutMock } from "@/lib/auth";
import { memberNav } from "@/lib/nav";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Preferences — FDNY IT Service Portal" },
      {
        name: "description",
        content:
          "Notification channels, default unit, accessibility options, and session controls for the portal.",
      },
      { property: "og:title", content: "Preferences — FDNY IT Service Portal" },
      {
        property: "og:description",
        content: "Control how the portal notifies you and what it shows by default.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const toggles = [
  {
    key: "email",
    label: "Email updates",
    hint: "Status changes and technician notes on your cases.",
    initial: true,
  },
  {
    key: "sms",
    label: "SMS for critical cases",
    hint: "Only for Critical priority affecting an in-service unit.",
    initial: true,
  },
  {
    key: "recovery",
    label: "Device recovery alerts",
    hint: "Notify me when a sound ping succeeds or a device comes back online.",
    initial: true,
  },
  {
    key: "digest",
    label: "Weekly unit digest",
    hint: "Monday summary of everything your unit opened and closed.",
    initial: false,
  },
  {
    key: "motion",
    label: "Reduce motion",
    hint: "Turn off animated transitions across the portal.",
    initial: false,
  },
  {
    key: "contrast",
    label: "High contrast text",
    hint: "Heavier weights and stronger contrast for apparatus-bay lighting.",
    initial: false,
  },
];

function SettingsPage() {
  const { user, navUser } = useSessionUser();
  const navigate = useNavigate();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(toggles.map((t) => [t.key, t.initial])),
  );
  const [landing, setLanding] = useState("home");
  const [density, setDensity] = useState("comfortable");

  const save = () => toast.success("Preferences saved");

  return (
    <div className="min-h-screen bg-background">
      <Navbar theme="red" items={memberNav} user={navUser ?? { name: "Not signed in", initials: "--" }} />

      <PageHeader
        eyebrow="Preferences"
        icon={SlidersHorizontal}
        title="Portal preferences"
        description="How the portal reaches you, what it opens on, and how much it puts on screen at once."
      />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Card className="gap-0 rounded-xl p-6 shadow-card">
          <h2 className="font-display text-xl font-bold">Notifications</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sent to {user?.email ?? "the address on your member record"} and the number on your
            member record.
          </p>
          <div className="mt-5 divide-y">
            {toggles.slice(0, 4).map((t) => (
              <Row
                key={t.key}
                label={t.label}
                hint={t.hint}
                checked={state[t.key] ?? false}
                onChange={(v) => setState((s) => ({ ...s, [t.key]: v }))}
              />
            ))}
          </div>
        </Card>

        <Card className="mt-6 gap-0 rounded-xl p-6 shadow-card">
          <h2 className="font-display text-xl font-bold">Display</h2>
          <div className="mt-5 divide-y">
            {toggles.slice(4).map((t) => (
              <Row
                key={t.key}
                label={t.label}
                hint={t.hint}
                checked={state[t.key] ?? false}
                onChange={(v) => setState((s) => ({ ...s, [t.key]: v }))}
              />
            ))}
          </div>
          <Separator className="my-6" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="landing">Open the portal on</Label>
              <Select value={landing} onValueChange={setLanding}>
                <SelectTrigger id="landing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="my-cases">My Cases</SelectItem>
                  <SelectItem value="report">Report an Issue</SelectItem>
                  <SelectItem value="services">Service Catalog</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="density">List density</Label>
              <Select value={density} onValueChange={setDensity}>
                <SelectTrigger id="density">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="compact">Compact</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="mt-6 gap-0 rounded-xl p-6 shadow-card">
          <h2 className="font-display text-xl font-bold">Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {navUser?.name ?? "nobody"}
            {navUser?.role ? ` · ${navUser.role}` : ""}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => toast.info("Other sessions signed out")}
            >
              Sign out other devices
            </Button>
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
          </div>
        </Card>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setState(Object.fromEntries(toggles.map((t) => [t.key, t.initial])));
              setLanding("home");
              setDensity("comfortable");
              toast.info("Preferences reset to defaults");
            }}
          >
            Reset
          </Button>
          <Button onClick={save}>Save preferences</Button>
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
