import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Database, Headset, MapPin, Radio, Signal, TicketPlus } from "lucide-react";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { memberNav } from "@/lib/nav";
import { useRequireSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fire Department IT Service & Support Portal" },
      {
        name: "description",
        content:
          "Concept service portal for fire-service field technology: report IT issues, track cases, and explore device recovery, eSIM refresh, and inventory validation automation.",
      },
      { property: "og:title", content: "Fire Department IT Service & Support Portal" },
      {
        property: "og:description",
        content:
          "Report technology issues, track cases, and manage field devices in this concept IT portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const automationCases = [
  {
    icon: MapPin,
    tag: "Device Recovery",
    title: "Device Localization from the Asset Catalog",
    body: "Enable self-service tracking for misplaced field tablets, such as ePCR devices accidentally left at hospitals or other locations.",
    points: [
      "Locate enrolled field tablets",
      "See the assigned station on a map",
      "View last known location",
      "Identify device status",
      "Escalate to a service ticket when the device is not found",
    ],
  },
  {
    icon: Signal,
    tag: "Connectivity",
    title: "Carrier eSIM Refreshes",
    body: "Automate cellular connectivity recovery for FirstNet and Verizon devices experiencing connectivity drops.",
    points: [
      "Detect connectivity problems",
      "Trigger eSIM refresh",
      "Restore cellular service remotely",
      "Reduce technician travel",
      "Improve field-device availability",
    ],
  },
  {
    icon: Database,
    tag: "Asset Data",
    title: "Smart Inventory Validation",
    body: "Automatically validate and correct user-submitted equipment tags against the CMDB catalog to maintain clean and reliable asset data.",
    points: [
      "Validate equipment IDs",
      "Match against CMDB records",
      "Detect incorrect tags",
      "Suggest corrections",
      "Maintain accurate inventory records",
    ],
  },
];

function LandingPage() {
  // Signed-out visitors are sent to the sign-in screen.
  const { navUser, isStaff } = useRequireSession();
  return (
    <div className="min-h-screen bg-background">
      <Navbar theme="red" items={memberNav} user={navUser ?? { name: "Not signed in", initials: "--" }} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-navy text-navy-foreground">
          <div className="grid-mesh absolute inset-0 opacity-25" aria-hidden />
          <div
            className="absolute -top-32 left-1/3 size-[30rem] rounded-full bg-primary/25 blur-3xl"
            aria-hidden
          />
          <div className="absolute top-24 right-12 hidden lg:block" aria-hidden>
            <span className="relative grid size-3 place-items-center">
              <span className="absolute size-3 rounded-full bg-primary/60 animate-ping-slow" />
              <span className="size-2 rounded-full bg-primary" />
            </span>
          </div>
          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto flex max-w-4xl flex-col items-center text-center animate-rise">
              <h1 className="mt-8 font-display text-7xl leading-[0.9] font-extrabold tracking-tight sm:text-9xl lg:text-[11rem]">
                FD
              </h1>
              <p className="mt-4 text-xl font-semibold text-navy-foreground/85 sm:text-2xl">
                Fire Department
              </p>
              <p className="mt-6 font-display text-4xl font-bold text-primary-foreground sm:text-5xl">
                IT Service &amp; Support Portal
              </p>
              <p className="mt-5 max-w-2xl text-balance-tight text-base text-navy-foreground/75 sm:text-lg">
                Quickly report technology issues, manage field equipment, and get assistance from
                the Fire Department IT Service Desk.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <Link to="/report-ticket">
                    <TicketPlus className="size-4" /> Let&apos;s Get Started
                  </Link>
                </Button>
                {/* Service-desk entry points are only offered to staff. */}
                {isStaff ? (
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-white/30 bg-white/10 text-navy-foreground hover:bg-white/20 hover:text-navy-foreground"
                  >
                    <Link to="/staff">
                      <Headset className="size-4" /> Service desk
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Automation cases */}
        <section className="border-y bg-secondary/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="font-display text-3xl font-extrabold">Fire Department Service Automation Cases</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Three service-desk workflows being implemented to cut dispatches and keep field
              technology online.
            </p>
            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {automationCases.map(({ icon: Icon, tag, title, body, points }) => (
                <Card
                  key={title}
                  className="gap-0 rounded-2xl border-t-4 border-t-primary p-7 shadow-card transition-shadow hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-12 place-items-center rounded-xl bg-navy text-navy-foreground">
                      <Icon className="size-6" />
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      {tag}
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  <ul className="mt-5 space-y-2 border-t pt-5 text-sm">
                    {points.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        <span className="text-foreground/85">{p}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTAs */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <Link
              to="/report-ticket"
              className="group rounded-2xl bg-primary p-8 text-primary-foreground shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span className="grid size-12 place-items-center rounded-xl bg-white/15">
                <TicketPlus className="size-6" />
              </span>
              <h3 className="mt-5 font-display text-2xl font-extrabold">Report a Ticket</h3>
              <p className="mt-2 text-sm text-primary-foreground/85">
                Need technical assistance? Start a new service request.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                Start with the AI assistant
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>

{isStaff ? (
            <Link
              to="/staff"
              className="group rounded-2xl bg-navy p-8 text-navy-foreground shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <span className="grid size-12 place-items-center rounded-xl bg-white/12">
                <Headset className="size-6" />
              </span>
              <h3 className="mt-5 font-display text-2xl font-extrabold">
                Service desk view
              </h3>
              <p className="mt-2 text-sm text-navy-foreground/80">
                Access the service-desk dashboard and manage incoming cases.
              </p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
                Open dashboard
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
            ) : null}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
