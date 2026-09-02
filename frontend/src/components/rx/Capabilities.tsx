import { motion } from "motion/react";
import { Crosshair, Download, Globe, Pencil } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as const;

const items = [
  {
    icon: Crosshair,
    title: "Detailed damage analysis",
    body: "Access pothole depth, width, area, and severity ratings with AI-powered assessment.",
  },
  {
    icon: Download,
    title: "Repair cost estimates",
    body: "Get instant cost estimates for pothole repairs based on size and depth.",
  },
  {
    icon: Globe,
    title: "City-wide dashboard",
    body: "Monitor all road conditions across your municipality in one view.",
  },
  {
    icon: Pencil,
    title: "Repair prioritization",
    body: "Auto-rank potholes by severity and generate work orders in real-time.",
  },
];

export function Capabilities() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-20 md:px-8 md:py-28">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <p className="order-2 text-sm leading-snug text-subtle md:order-1 md:mb-2">
          Revolutionize your
          <br />
          road maintenance
        </p>
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease }}
          className="display order-1 max-w-xl text-right text-4xl md:order-2 md:text-[3.5rem]"
        >
          Powerful features for intelligent road inspection
        </motion.h2>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 md:mt-16 md:grid-cols-4">
        {items.map((it, i) => (
          <motion.article
            key={it.title}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.8, delay: i * 0.1, ease }}
            className="card-panel flex min-h-56 flex-col p-6"
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-accent/45 text-accent">
              <it.icon size={17} />
            </span>
            <h3 className="mt-auto pt-10 text-sm font-medium">{it.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-subtle">{it.body}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
