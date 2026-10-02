import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/fdny/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { signIn } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Fire Department IT Service Portal" },
      {
        name: "description",
        content:
          "Sign in to the Fire Department IT service portal for field technology and service-desk workflows.",
      },
      { property: "og:title", content: "Sign In — Fire Department IT Service Portal" },
      {
        property: "og:description",
        content: "Concept authentication screen for a fire-service IT support portal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Which portal the member is signing in to. The backend decides whether
   *  they are actually allowed into the service-desk one. */
  const [mode, setMode] = useState<"member" | "staff">("member");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = "Enter your email, Employee ID or login.";
    else if (identifier.includes("@") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier))
      next.identifier = "Enter a valid email address.";
    // No local strength rule: GLPI is the only thing that may judge a password.
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setLoading(true);
    // Identifies the member against live GLPI by login, Employee ID or e-mail.
    const res = await signIn(identifier, password);
    setLoading(false);
    if (!res.ok) {
      setFormError(res.error ?? "Sign in failed.");
      return;
    }
    const staff = res.user?.role === "staff";
    if (mode === "staff" && !staff) {
      setFormError(
        "That account does not have service-desk access. Use the FD end users tab, or sign in with a service-desk account.",
      );
      return;
    }
    toast.success(
      res.user
        ? `Signed in as ${res.user.displayName ?? res.user.name}${staff ? " (Service desk)" : ""}`
        : "Signed in to the portal",
    );
    if (!res.passwordVerified) {
      toast.info("GLPI has credential login disabled, so the password was not verified.");
    }
    // Staff land in the service-desk portal; members in the self-service one.
    navigate({ to: staff && mode === "staff" ? "/staff" : "/" });
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-navy px-12 py-16 text-navy-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="grid-mesh absolute inset-0 opacity-30" aria-hidden />
        <div
          className="absolute -top-24 -right-24 size-96 rounded-full bg-primary/30 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <Logo subtitle="Technology & Field Services" />
        </div>
        <div className="relative max-w-lg">
          <p className="font-display text-[7rem] leading-none font-extrabold tracking-tight">
            FD
          </p>
          <p className="mt-2 text-xl font-semibold text-navy-foreground/90">
            Fire Department
          </p>
          <p className="mt-6 text-base text-navy-foreground/70">
            Technology &amp; Field Services Portal
          </p>
          <div className="mt-10 grid gap-3 text-sm text-navy-foreground/75">
            {[
              "Locate and recover misplaced field tablets",
              "Restore FirstNet and Verizon connectivity remotely",
              "Validate equipment tags against the asset catalog",
            ].map((line) => (
              <div key={line} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                {line}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-navy-foreground/50">
          Not an official Fire Department system and not affiliated with or
          authorized by any government agency.
        </p>
      </section>

      <section className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-md animate-rise">
          <div className="mb-8 lg:hidden">
            <Logo tone="dark" subtitle="Technology & Field Services" />
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
            <h1 className="font-display text-2xl font-extrabold">Sign in to IT Service Portal</h1>

            {/* Two clearly separate experiences: self-service for members, the
                queue and fleet for the service desk. */}
            <div
              role="tablist"
              aria-label="Sign-in type"
              className="mt-4 grid grid-cols-2 gap-1 rounded-lg border bg-muted/50 p-1"
            >
              {(
                [
                  { id: "member", label: "FD end users" },
                  { id: "staff", label: "Service desk" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  onClick={() => {
                    setMode(t.id);
                    setFormError(null);
                  }}
                  className={
                    mode === t.id
                      ? "rounded-md bg-card px-3 py-2 text-sm font-semibold shadow-sm"
                      : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {mode === "member"
                ? "Self-service for your own assigned equipment. Use your Employee ID, login or department email."
                : "Service desk: dashboard, cases, device fleet, inventory and reporting on behalf of a member."}
            </p>

            {formError ? (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : null}

            <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
              <div className="space-y-2">
                <Label htmlFor="identifier">Email, Employee ID or login</Label>
                <Input
                  id="identifier"
                  value={identifier}
                  autoComplete="username"
                  placeholder={mode === "member" ? "10101, or your email address" : "900108, or your service-desk login"}
                  aria-invalid={Boolean(errors.identifier)}
                  aria-describedby={errors.identifier ? "identifier-error" : undefined}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
                {errors.identifier ? (
                  <p id="identifier-error" className="text-xs text-destructive">
                    {errors.identifier}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    value={password}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-10"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.password ? (
                  <p id="password-error" className="text-xs text-destructive">
                    {errors.password}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() =>
                    toast.info("Password resets are handled by the service desk.")
                  }
                  className="text-sm font-medium text-steel underline-offset-4 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Verifying credentials…
                  </>
                ) : (
                  <>
                    <Lock className="size-4" /> Sign In
                  </>
                )}
              </Button>

            </form>

            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> Authorized personnel only. Activity may be
              monitored.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Trouble signing in?{" "}
            <Link to="/help" className="font-medium text-steel underline-offset-4 hover:underline">
              Contact the service desk
            </Link>
          </p>

        </div>
      </section>
    </main>
  );
}
