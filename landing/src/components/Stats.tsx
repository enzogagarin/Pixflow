import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const stats: { target: number; prefix?: string; suffix?: string; label: string }[] = [
  { target: 3, prefix: '<', suffix: 's', label: '100 images × 2K→800' },
  { target: 100, prefix: '<', suffix: 'ms', label: 'Single image pipeline' },
  { target: 70, suffix: 'KB', label: 'Bundle (gzipped)' },
  { target: 0, label: 'Server roundtrips' },
]

function Counter({
  target,
  prefix,
  suffix,
  active,
}: {
  target: number
  prefix?: string
  suffix?: string
  active: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const count = useMotionValue(reduced ? target : 0)
  const rounded = useTransform(count, (v) =>
    target >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString(),
  )

  useEffect(() => {
    if (!active) return
    if (reduced) {
      count.set(target)
      return
    }
    const controls = animate(count, target, { duration: 1.6, ease: [0.22, 1, 0.36, 1] })
    return controls.stop
  }, [active, target, count, reduced])

  return (
    <span>
      {prefix}
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  )
}

export function Stats() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <section id="benchmarks" className="relative z-[1] mx-auto max-w-[1200px] px-6 py-[90px]">
      <motion.div
        ref={ref}
        initial="hidden"
        animate={inView ? 'show' : 'hidden'}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1 } },
        }}
        className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-[18px]"
      >
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] } },
            }}
            whileHover={{ y: -3 }}
            className="rounded-[18px] border border-white/10 bg-white/[0.04] px-6 py-9 text-center shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[22px] backdrop-saturate-[150%] transition-[border-color] duration-300 hover:border-white/[0.18]"
          >
            <div className="mb-2 text-[40px] font-extrabold leading-none tracking-[-2px] text-gradient md:text-[48px]">
              <Counter target={s.target} prefix={s.prefix} suffix={s.suffix} active={inView} />
            </div>
            <div
              className="text-[13px] tracking-[0.3px] text-[color:var(--color-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {s.label}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
