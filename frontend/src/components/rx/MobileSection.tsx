import { motion } from "motion/react";
import { MonitorSmartphone, LayoutGrid, Compass, MoreHorizontal } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as const;

const points = [
  {
    icon: MonitorSmartphone,
    title: "Responsive design",
    body: "The app adjusts perfectly to any device, so field crews can scan and report potholes from phones or tablets.",
  },
  {
    icon: LayoutGrid,
    title: "User-friendly layout",
    body: "Simplified design for quick pothole logging in the field, with damage metrics always at your fingertips.",
  },
  {
    icon: Compass,
    title: "Intuitive navigation",
    body: "Intuitive navigation to access scan results, repair estimates, and work orders in just a few taps.",
  },
];

const bars = [16, 30, 20, 42, 26, 60, 92, 74, 48, 34, 54, 24, 18, 12];

function PhoneMock() {
  return (
    <div className="card-panel relative overflow-hidden p-4 md:p-6">
      <div className="grid grid-cols-2 gap-3">
        {/* left phone: marked sectors */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="display text-sm font-bold">
            <span className="inline-block -scale-x-100">R</span>X
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm">Detected potholes</span>
            <MoreHorizontal size={14} className="text-subtle" />
          </div>            <div className="mt-3 space-y-2 border-t border-border pt-3 text-[10px] text-subtle">
            <div className="flex justify-between">
              <span>PH-0847 ▾</span>
              <span>Severe ▾</span>
            </div>
            <div className="flex justify-between text-foreground">
              <span>34.0522° N</span>
              <span>118.2437° W</span>
            </div>
          </div>
          <div className="relative mt-3 h-24 overflow-hidden rounded-lg bg-elevated/40">
            <svg viewBox="0 0 160 100" className="h-full w-full">
              <motion.path
                d="M52 18 L112 30 L124 68 L74 90 L44 62 Z"
                fill="oklch(0.855 0.135 89 / 0.18)"
                stroke="oklch(0.855 0.135 89 / 0.55)"
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, ease }}
              />
            </svg>
          </div>
        </div>

        {/* right phone: metrics */}
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Depth", v: "12", u: "cm" },
              { l: "Area", v: "0.8", u: "m²" },
            ].map((m) => (
              <div key={m.l} className="rounded-lg border border-border p-2">
                <p className="text-[10px] text-subtle">{m.l}</p>
                <p className="display text-2xl">
                  {m.v} <span className="text-[10px] text-subtle">{m.u}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border p-2">
            <p className="text-[10px] text-subtle">Road Condition</p>
            <div className="mt-2 flex h-12 items-end gap-[3px]">
              {bars.map((h, i) => (
                <motion.span
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.03, ease }}
                  className={`flex-1 rounded-sm ${i === 6 ? "bg-foreground/50" : "bg-foreground/15"}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border p-2">
              <p className="display text-2xl">6.7</p>
            </div>
            <div className="rounded-lg border border-accent/45 bg-accent/10 p-2">
              <p className="text-[10px] text-accent-dim">Temperature</p>
              <p className="display text-2xl text-accent-dim">29°</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileSection() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-8 md:py-28">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease }}
          className="display max-w-md text-4xl md:text-[3.5rem]"
        >
          Field-ready mobile app
        </motion.h2>
        <div className="flex items-center gap-4">
          <p className="text-sm leading-snug text-subtle">
            Road data, accessible
            <br />
            anytime, anywhere
          </p>
          <button className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-85">
            Try now
          </button>
        </div>
      </div>

      <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-[1.15fr_1fr] md:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.9, ease }}
        >
          <PhoneMock />
        </motion.div>

        <ul className="flex flex-col gap-9">
          {points.map((p, i) => (
            <motion.li
              key={p.title}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.12, ease }}
              className="flex gap-4"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/50 text-accent">
                <p.icon size={15} />
              </span>
              <div>
                <h3 className="text-sm font-medium">{p.title}</h3>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-subtle">{p.body}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
