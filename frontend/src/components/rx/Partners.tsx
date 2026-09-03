import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Quote } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as const;

const partners = [
  {
    name: "CITY OF AUSTIN",
    quote:
      "Dronacharya has transformed our road inspection workflow. We went from monthly manual surveys to daily automated scans across 400+ miles of roads.",
  },
  {
    name: "DOT CALIFORNIA",
    quote:
      "The pothole detection accuracy is outstanding. We've reduced repair response times by 60% since adopting the Dronacharya platform.",
  },
  {
    name: "INFRATECH CORP",
    quote:
      "The cost estimation feature alone saved us hundreds of thousands in budget planning. Real-time data we can actually act on.",
  },
  {
    name: "ROADSTAR AI",
    quote:
      "As Roadstar AI, we're thrilled to partner with Dronacharya. The drone survey integration and AI damage assessment is exactly what municipalities need.",
  },
  {
    name: "PAVEMENT360",
    quote:
      "Survey-grade accuracy paired with a dashboard the whole public works team actually enjoys using. Game changer for road maintenance.",
  },
];

export function Partners() {
  const [active, setActive] = useState(3);
  const go = (dir: number) => setActive((p) => (p + dir + partners.length) % partners.length);

  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 md:px-8 md:py-32">
      <motion.h2
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease }}
        className="display text-center text-4xl md:text-[4.25rem]"
      >
        Easy integration
        <br />
        with our partners
      </motion.h2>

      <div className="mt-12 flex flex-wrap items-center justify-center gap-2 md:mt-16">
        {partners.map((p, i) => (
          <button
            key={p.name}
            onClick={() => setActive(i)}
            className={`rounded-lg px-5 py-3.5 text-xs font-semibold tracking-wide transition-all ${
              i === active
                ? "border border-accent bg-accent/10 text-accent"
                : "border border-transparent bg-elevated/70 text-subtle hover:text-foreground"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="relative mt-16 flex items-center justify-center md:mt-24">
        <button
          onClick={() => go(-1)}
          className="absolute left-0 hidden text-sm text-subtle transition-colors hover:text-foreground md:block"
        >
          Previous
        </button>

        <div className="relative w-full max-w-3xl">
          {/* stacked cards behind */}
          <div className="absolute -top-12 left-1/2 h-24 w-[76%] -translate-x-1/2 rounded-2xl border border-border bg-card/60" />
          <div className="absolute -top-6 left-1/2 h-24 w-[88%] -translate-x-1/2 rounded-2xl border border-border bg-card/80" />

          <AnimatePresence mode="wait">
            <motion.blockquote
              key={active}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ duration: 0.5, ease }}
              className="relative rounded-2xl border border-accent bg-gradient-to-b from-accent/8 to-transparent px-8 py-12 text-center md:px-16"
            >
              <Quote size={18} className="absolute top-8 left-6 text-accent md:left-10" />
              <p className="mx-auto max-w-xl text-base leading-relaxed text-accent-dim md:text-lg">
                {partners[active]?.quote}
              </p>
              <Quote size={18} className="mx-auto mt-3 rotate-180 text-accent" />
            </motion.blockquote>
          </AnimatePresence>
        </div>

        <button
          onClick={() => go(1)}
          className="absolute right-0 hidden text-sm text-subtle transition-colors hover:text-foreground md:block"
        >
          Next
        </button>
      </div>

      <div className="mt-8 flex justify-center gap-6 md:hidden">
        <button onClick={() => go(-1)} className="text-sm text-subtle">
          Previous
        </button>
        <button onClick={() => go(1)} className="text-sm text-subtle">
          Next
        </button>
      </div>
    </section>
  );
}
