import { motion, type Variants } from 'framer-motion'
import { useRef } from 'react'
import { SectionLabel } from './SectionLabel'

type Pattern = number[]

const cards: { title: string; body: string; pattern: Pattern }[] = [
  {
    title: 'Privacy is architecture',
    body: "Photos never leave the user's device. No server uploads, no logs, no cloud storage. GDPR compliance built in, not bolted on.",
    pattern: [1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
  },
  {
    title: 'GPU-native speed',
    body: "WebGPU compute shaders process pixels in parallel. 100 images × 2K resized in under 3 seconds on an M1 Mac. Canvas2D can't compete.",
    pattern: [0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0],
  },
  {
    title: 'Declarative pipelines',
    body: 'Chain filters with a fluent builder API. No imperative canvas calls, no manual texture management. Read the code, understand the pipeline.',
    pattern: [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
  },
  {
    title: 'Zero cost at scale',
    body: "Your users' GPUs do the work, not your servers. Bandwidth drops 90%. Server-side image processing becomes optional. Your AWS bill shrinks.",
    pattern: [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1],
  },
]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const cardVariant: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] } },
}

function PatternIcon({ pattern }: { pattern: Pattern }) {
  return (
    <div className="mb-[22px] grid h-12 w-12 grid-cols-4 grid-rows-4 gap-[2px] rounded-[14px] border border-white/[0.18] bg-[linear-gradient(135deg,rgba(0,212,255,0.15),rgba(123,47,247,0.15))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      {pattern.map((v, i) => (
        <span
          key={i}
          className="rounded-[1px] bg-gradient-accent"
          style={{ opacity: v ? 1 : 0 }}
        />
      ))}
    </div>
  )
}

function WhyCard({ title, body, pattern }: (typeof cards)[number]) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * 100
    const my = ((e.clientY - rect.top) / rect.height) * 100
    el.style.setProperty('--mx', `${mx}%`)
    el.style.setProperty('--my', `${my}%`)
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      variants={cardVariant}
      whileHover={{ y: -4 }}
      className="group relative overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.04] p-9 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[22px] backdrop-saturate-[150%] transition-[background,border-color,box-shadow] duration-300 hover:border-white/[0.18] hover:bg-white/[0.07] hover:shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(0,212,255,0.1)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1/2 h-[200%] w-[200%] opacity-0 transition-opacity duration-[400ms] group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(0,212,255,0.12), transparent 40%)',
        }}
      />
      <PatternIcon pattern={pattern} />
      <h3 className="mb-[10px] text-[20px] font-bold tracking-[-0.5px] text-white">{title}</h3>
      <p className="text-[15px] leading-[1.7] text-[color:var(--color-muted)]">{body}</p>
    </motion.div>
  )
}

export function WhySection() {
  return (
    <section id="why" className="relative z-[1] mx-auto max-w-[1200px] px-6 py-[120px]">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="mb-[60px]"
      >
        <SectionLabel>Why pixflow</SectionLabel>
        <h2 className="text-[clamp(32px,4.5vw,52px)] font-extrabold leading-[1.1] tracking-[-1.5px] text-white">
          Built for speed,
          <br />
          designed for privacy.
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
        className="grid grid-cols-1 gap-5 md:grid-cols-2"
      >
        {cards.map((c) => (
          <WhyCard key={c.title} {...c} />
        ))}
      </motion.div>
    </section>
  )
}
