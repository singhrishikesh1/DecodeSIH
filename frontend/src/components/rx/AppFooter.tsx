import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

export function AppFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-subtle">
            AI-powered pothole detection and repair estimation for modern road infrastructure.
          </p>
        </div>

        <Link
          to="/dashboard"
          className="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Enter platform
        </Link>
      </div>
      <div className="mx-auto max-w-[1400px] px-5 pb-8 text-xs text-subtle/60 md:px-8">
        V.01.24 — © {new Date().getFullYear()} Dronacharya
      </div>
    </footer>
  );
}
