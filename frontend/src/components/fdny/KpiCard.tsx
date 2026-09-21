import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: number | string;
  trend: string;
  direction: "up" | "down" | "flat";
  hint?: string;
  loading?: boolean;
}

function useCountUp(target: number | string) {
  const numeric = typeof target === "number" ? target : null;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (numeric === null) return;
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(numeric * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const safety = setTimeout(() => setN(numeric), duration + 200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [numeric]);
  return numeric === null ? target : n;
}

export function KpiCard({ label, value, trend, direction, hint, loading }: Props) {
  const display = useCountUp(value);
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  if (loading) {
    return (
      <Card className="gap-0 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-8 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-3 w-16 animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  return (
    <Card className="gap-0 rounded-xl p-5 shadow-card transition-shadow duration-200 hover:shadow-lift">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 font-display text-3xl font-extrabold tabular-nums">{display}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
            direction === "up" && "bg-primary/10 text-primary",
            direction === "down" && "bg-success/12 text-success",
            direction === "flat" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-3" />
          {trend}
        </span>
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    </Card>
  );
}
