import { Link } from "@tanstack/react-router";
import { memberNav } from "@/lib/nav";
import { useSessionUser } from "@/lib/session";

export function Footer() {
  const { isStaff } = useSessionUser();

  return (
    <footer className="border-t bg-card">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Footer">
          {memberNav.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
          {/* Service-desk view is only linked for staff. */}
          {isStaff ? (
            <Link
              to="/staff"
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Service desk
            </Link>
          ) : null}
        </nav>
        <div className="mt-6 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">
            FDNY IT Service Portal
          </p>
          <p>
            This is an independent design concept. It is not an official Fire Department of the City
            of New York website and is not affiliated with or authorized by the City of New York.
            All data shown is fictional.
          </p>
        </div>
      </div>
    </footer>
  );
}
