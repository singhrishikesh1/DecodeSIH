import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const links = [
  { label: "Overview", to: "/dashboard" as const },
  { label: "Inspections", to: "/inspections" as const },
  { label: "Map", to: "/map" as const },
  { label: "Defects & Repairs", to: "/defects" as const },
  { label: "Reports", to: "/reports" as const },
];

const secondary = [
  { label: "Live AI View", to: "/live" as const },
  { label: "Cost Estimator", to: "/cost-estimator" as const },
];

export function AppNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-5 md:px-8">
        <Link to="/dashboard" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-sm text-subtle transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <nav className="ml-auto hidden items-center gap-5 xl:flex">
          {secondary.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-sm text-subtle transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto text-foreground lg:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="overflow-hidden border-t border-border bg-card/95 lg:hidden">
          <div className="flex flex-col gap-1 px-5 py-4">
            {links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpen(false)}
                className="py-2 text-sm text-subtle"
              >
                {l.label}
              </Link>
            ))}
            {secondary.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpen(false)}
                className="py-2 text-sm text-subtle"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
