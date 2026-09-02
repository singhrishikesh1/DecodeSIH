import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-5 py-14 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-subtle">
            AI-powered pothole detection and repair estimation for modern road infrastructure.
          </p>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-subtle">
          {["Pricing", "About Us", "Contact Us", "FAQ", "Privacy"].map((l) => (
            <span key={l} className="cursor-pointer transition-colors hover:text-foreground">
              {l}
            </span>
          ))}
        </nav>

        <Link
          to="/dashboard"
          className="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Enter platform
        </Link>
      </div>
      <div className="mx-auto max-w-[1400px] px-5 pb-10 text-xs text-subtle/60 md:px-8">
        V.01.24 — © {new Date().getFullYear()} RX
      </div>
    </footer>
  );
}
