import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOutMock } from "@/lib/auth";
import type { NavItem } from "@/lib/nav";

export type { NavItem } from "@/lib/nav";

export type NavTheme = "red" | "blue" | "navy";

const themes: Record<NavTheme, string> = {
  red: "bg-primary text-primary-foreground",
  blue: "bg-steel text-steel-foreground",
  navy: "bg-navy text-navy-foreground",
};

interface Props {
  theme?: NavTheme;
  brandSubtitle?: string;
  items: NavItem[];
  user: { name: string; initials: string; role?: string };
  /** Where the account menu's Profile / Preferences entries point. */
  /** Kept so callers can keep passing it; the account menu has no links now. */
  accountArea?: "member" | "staff";
}

export function Navbar({
  theme = "red",
  brandSubtitle = "IT Service Portal",
  items,
  user,
  accountArea = "member",
}: Props) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    signOutMock();
    toast.success("Signed out of the portal");
    navigate({ to: "/login" });
  };


  const renderItem = (item: NavItem, mobile = false) => (
    <Link
      key={item.label}
      to={item.to}
      onClick={() => setOpen(false)}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium text-current/85 transition-colors hover:bg-white/15 hover:text-white",
        mobile && "block w-full text-left",
      )}
      activeOptions={{ exact: item.to === "/" || item.to === "/staff" }}
      activeProps={{ className: "bg-white/20 text-white" }}
    >
      {item.label}
    </Link>
  );

  return (
    <header className={cn("sticky top-0 z-40 border-b border-white/10 shadow-sm", themes[theme])}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <Logo subtitle={brandSubtitle} />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {items.map((i) => renderItem(i))}
        </nav>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-white/25 py-1 pr-3 pl-1 transition-colors hover:bg-white/15"
                aria-label="Open account menu"
              >
                <span className="grid size-8 place-items-center rounded-full bg-white/20 text-xs font-bold">
                  {user.initials}
                </span>
                <span className="hidden text-left text-xs leading-tight sm:block">
                  <span className="block font-semibold">{user.name}</span>
                  {user.role ? <span className="block text-current/70">{user.role}</span> : null}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
              {user.role ? (
                <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground">
                  {user.role}
                </DropdownMenuLabel>
              ) : null}
              {/* Profile, Preferences and Help are still sample-data screens and
                  showed a different member's record, so they are not linked. */}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            className="text-current hover:bg-white/15 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/10 px-4 pb-4 lg:hidden">
          <div className="flex items-center justify-between py-2">
            <span className="text-xs tracking-wide uppercase opacity-70">Navigation</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-4" />
            </button>
          </div>
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {items.map((i) => renderItem(i, true))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
