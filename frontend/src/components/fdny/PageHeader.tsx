import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  tone?: "navy" | "light";
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  tone = "navy",
}: Props) {
  if (tone === "light") {
    return (
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-8 sm:px-6">
          <div>
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-1 font-display text-3xl font-extrabold">{title}</h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden bg-navy text-navy-foreground">
      <div className="grid-mesh absolute inset-0 opacity-20" aria-hidden />
      <div
        className="absolute -top-28 left-1/4 size-[22rem] rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-4 py-12 sm:px-6 sm:py-14">
        <div className="max-w-2xl">
          {eyebrow ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
              {Icon ? <Icon className="size-3.5" /> : null}
              {eyebrow}
            </span>
          ) : null}
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 text-balance-tight text-navy-foreground/75">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
