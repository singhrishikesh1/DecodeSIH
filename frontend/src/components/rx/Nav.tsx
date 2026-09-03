import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const links = [
  { label: "Home", to: "/" as const },
  { label: "Cost Estimator", to: "/cost-estimator" as const },
  { label: "Dashboard", to: "/dashboard" as const },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-50 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-10 px-5 md:px-8">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {links.map((l, i) => (
            <Link
              key={l.label}
              to={l.to}
              className={`text-sm transition-colors hover:text-foreground ${
                i === 0 ? "text-foreground" : "text-subtle"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-6 md:flex">
          <span className="cursor-pointer text-sm text-subtle transition-colors hover:text-foreground">
            Register
          </span>
          <span className="cursor-pointer text-sm text-subtle transition-colors hover:text-foreground">
            Login
          </span>
        </div>

        <Link
          to="/dashboard"
          className="ml-auto hidden text-sm text-foreground transition-opacity hover:opacity-70 md:ml-10 md:block"
        >
          Request a demo
        </Link>

        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto text-foreground md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="overflow-hidden border-t border-border bg-card/95 md:hidden"
        >
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
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
            >
              Enter platform
            </Link>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
