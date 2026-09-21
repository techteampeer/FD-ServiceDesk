import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  subtitle = "IT Service Portal",
  tone = "light",
}: {
  className?: string;
  subtitle?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-md border",
          tone === "light" ? "border-white/25 bg-white/10" : "border-border bg-primary",
        )}
      >
        <Flame
          className={cn("size-5", tone === "light" ? "text-white" : "text-primary-foreground")}
        />
      </span>
      <span className="leading-tight">
        <span
          className={cn(
            "block font-display text-lg font-extrabold tracking-[0.18em]",
            tone === "light" ? "text-white" : "text-foreground",
          )}
        >
          FDNY
        </span>
        <span
          className={cn(
            "block text-[11px]",
            tone === "light" ? "text-white/70" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </span>
      </span>
    </div>
  );
}
