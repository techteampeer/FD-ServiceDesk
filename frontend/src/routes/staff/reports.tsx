import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Download, FileText } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Navbar } from "@/components/fdny/Navbar";
import { Footer } from "@/components/fdny/Footer";
import { KpiCard } from "@/components/fdny/KpiCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { staffNav } from "@/lib/nav";
import { useRequireStaff } from "@/lib/session";
import { resolutionTrend, staffUser } from "@/lib/mock-data";
import { automationSavings, savedReports, slaByPriority, volumeTrend } from "@/lib/portal-data";

export const Route = createFileRoute("/staff/reports")({
  head: () => ({
    meta: [
      { title: "Reports — FDNY Service Desk" },
      {
        name: "description",
        content:
          "Case volume, SLA attainment, resolution time, and the dispatches avoided by service automation.",
      },
      { property: "og:title", content: "Reports — FDNY Service Desk" },
      {
        property: "og:description",
        content: "Service-desk reporting: volume, SLA, resolution time, and automation impact.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffReportsPage,
});

const headlineKpis = [
  {
    label: "Cases this period",
    value: 402,
    trend: "+6%",
    direction: "up" as const,
    hint: "last 6 weeks",
  },
  {
    label: "SLA attainment",
    value: "95%",
    trend: "+2pt",
    direction: "up" as const,
    hint: "all priorities",
  },
  {
    label: "Dispatches avoided",
    value: 234,
    trend: "+18%",
    direction: "up" as const,
    hint: "year to date",
  },
  {
    label: "Technician hours saved",
    value: 651,
    trend: "+21%",
    direction: "up" as const,
    hint: "year to date",
  },
];

function StaffReportsPage() {
  // A member who types this URL is redirected to the member portal.
  const { allowed, navUser } = useRequireStaff();
  const [range, setRange] = useState("6w");

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
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="inline-flex items-center gap-2 font-display text-3xl font-extrabold">
              <BarChart3 className="size-7 text-primary" /> Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              How the queue is moving, whether targets are being met, and what the automations are
              saving.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40" aria-label="Reporting period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6w">Last 6 weeks</SelectItem>
                <SelectItem value="q">This quarter</SelectItem>
                <SelectItem value="ytd">Year to date</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => toast.success("Export queued — you'll get an email")}
            >
              <Download className="size-4" /> Export
            </Button>
          </div>
        </header>

        <section aria-label="Headline metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {headlineKpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <ChartCard title="Cases created vs. resolved">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={volumeTrend} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="created"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    stroke="var(--chart-2)"
                    fill="var(--chart-2)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="SLA attainment vs. target (%)">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={slaByPriority} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[60, 100]} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="met" name="Met" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Automation impact">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={automationSavings} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "var(--muted)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="dispatchesAvoided"
                    name="Dispatches avoided"
                    fill="var(--chart-3)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="hoursSaved"
                    name="Hours saved"
                    fill="var(--chart-5)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Average resolution time (hours)">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={resolutionTrend} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 4]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </section>

        <Card className="gap-0 overflow-hidden rounded-xl p-0 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <h2 className="inline-flex items-center gap-2 font-display text-xl font-bold">
              <FileText className="size-5 text-muted-foreground" /> Scheduled reports
            </h2>
            <Button
              variant="outline"
              onClick={() => toast.info("Report builder is coming soon.")}
            >
              New report
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Report", "Owner", "Schedule", "Format", ""].map((h) => (
                    <TableHead key={h} className="whitespace-nowrap">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {savedReports.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-semibold whitespace-nowrap">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.owner}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {r.schedule}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{r.format}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toast.success(`${r.name} downloaded`)}
                      >
                        <Download className="size-4" /> Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>

      <Footer />
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 rounded-xl p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold">{title}</h3>
      {children}
    </Card>
  );
}
