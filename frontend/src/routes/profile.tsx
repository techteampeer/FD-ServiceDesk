import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Smartphone, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { PageHeader } from "@/components/fdny/PageHeader";
import { StatusBadge } from "@/components/fdny/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { currentUser, serviceCases } from "@/lib/mock-data";
import { memberNav } from "@/lib/nav";
import { useSessionUser } from "@/lib/session";
import { activityLog, fieldDevices, myCaseIds, userProfile } from "@/lib/portal-data";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — Fire Department IT Service Portal" },
      {
        name: "description",
        content:
          "Member details, assigned field devices, recent portal activity, and open cases for the signed-in user.",
      },
      { property: "og:title", content: "My Profile — Fire Department IT Service Portal" },
      {
        property: "og:description",
        content: "Member record, assigned devices, and recent portal activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const assigned = fieldDevices.filter((d) => userProfile.assignedDevices.includes(d.tag));
const openCases = serviceCases.filter((c) => myCaseIds.includes(c.id) && c.status !== "Resolved");

const healthStyles: Record<string, string> = {
  Online: "border-success/30 bg-success/12 text-success",
  Offline: "border-primary/30 bg-primary/10 text-primary",
  "Needs Attention": "border-warning/40 bg-warning/15 text-warning-foreground",
};

function ProfilePage() {
  const { navUser } = useSessionUser();
  return (
    <div className="min-h-screen bg-background">
      <Navbar theme="red" items={memberNav} user={navUser ?? { name: "Not signed in", initials: "--" }} />

      <PageHeader
        eyebrow="My profile"
        icon={UserRound}
        title={userProfile.name}
        description={`${userProfile.rank} · ${userProfile.unit} · Employee ID ${userProfile.employeeId}`}
        actions={
          <Button
            size="lg"
            variant="outline"
            className="border-white/30 bg-white/10 text-navy-foreground hover:bg-white/20 hover:text-navy-foreground"
            onClick={() =>
              toast.info("Profile changes are made in the department directory.")
            }
          >
            Request a correction
          </Button>
        }
      />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <Card className="gap-0 rounded-xl p-6 shadow-card">
            <h2 className="font-display text-xl font-bold">Member record</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail label="Rank" value={userProfile.rank} />
              <Detail label="Employee ID" value={userProfile.employeeId} />
              <Detail label="Email" value={userProfile.email} />
              <Detail label="Phone" value={userProfile.phone} />
              <Detail label="Battalion" value={userProfile.battalion} />
              <Detail label="Shift" value={userProfile.shift} />
              <Detail label="Joined" value={userProfile.joined} />
            </dl>
            <Separator className="my-6" />
            <Detail label="Assigned quarters" value={userProfile.station} />
          </Card>

          <Card className="gap-0 rounded-xl p-6 shadow-card">
            <h2 className="font-display text-xl font-bold">Assigned devices</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Equipment recorded against you in the CMDB.
            </p>
            <ul className="mt-5 space-y-3">
              {assigned.map((d) => (
                <li key={d.tag} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <Smartphone className="size-4 text-muted-foreground" />
                      {d.tag}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${healthStyles[d.health]}`}
                    >
                      {d.health}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {d.model} · {d.carrier}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last check-in {d.lastCheckIn} · battery {d.battery}% · {d.osVersion}
                  </p>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/report-ticket">Report a problem with a device</Link>
            </Button>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="gap-0 rounded-xl p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Open cases</h2>
              <Link to="/my-cases" className="text-sm font-semibold text-steel">
                View all
              </Link>
            </div>
            {openCases.length ? (
              <ul className="mt-4 space-y-3">
                {openCases.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4"
                  >
                    <span>
                      <span className="block text-sm font-semibold">{c.issue}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.id} · opened {c.created}
                      </span>
                    </span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No open cases. Nice shift.
              </p>
            )}
          </Card>

          <Card className="gap-0 rounded-xl p-6 shadow-card">
            <h2 className="font-display text-xl font-bold">Recent activity</h2>
            <ol className="mt-4 space-y-4">
              {activityLog.map((a) => (
                <li key={a.at} className="flex gap-3 text-sm">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-steel" />
                  <span>
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.at}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}
