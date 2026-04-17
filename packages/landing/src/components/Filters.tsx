import { motion, type Variants } from 'framer-motion'
import { SectionLabel } from './SectionLabel'

interface Filter {
  name: string
  version?: string
  active?: boolean
}

const filters: Filter[] = [
  { name: 'resize (Lanczos-3)', active: true },
  { name: 'crop', active: true },
  { name: 'rotate90', active: true },
  { name: 'flip', active: true },
  { name: 'pad', active: true },
  { name: 'brightness', active: true },
  { name: 'contrast', active: true },
  { name: 'saturation', active: true },
  { name: 'gaussianBlur', active: true },
  { name: 'unsharpMask', active: true },
  { name: 'autoOrient (EXIF)', active: true },
  { name: 'curves', version: 'v0.2' },
  { name: 'whiteBalance', version: 'v0.2' },
  { name: 'denoise', version: 'v0.2' },
  { name: 'histogram', version: 'v0.2' },
]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
}

const tag: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] } },
}

export function Filters() {
  return (
    <section id="filters" className="relative z-[1] mx-auto max-w-[960px] px-6 py-[120px]">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <SectionLabel>MVP Filter Set</SectionLabel>
        <h2 className="mb-4 text-[clamp(32px,4.5vw,52px)] font-extrabold leading-[1.1] tracking-[-1.5px] text-white">
          15 filters. All GPU.
        </h2>
        <p className="max-w-[560px] text-[17px] leading-[1.65] text-[color:var(--color-muted)]">
          Every filter is a WGSL compute shader. 8×8 workgroups. Linear sRGB color space. No CPU fallbacks in the hot
          path.
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
        className="mt-9 flex flex-wrap gap-[10px]"
      >
        {filters.map((f) => (
          <motion.div
            key={f.name}
            variants={tag}
            whileHover={{ y: -2, scale: 1.04 }}
            className={`cursor-default rounded-full border px-4 py-[10px] text-[12.5px] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[14px] transition-[background,border-color,color] duration-250 ${
              f.active
                ? 'active-tag border-[rgba(0,212,255,0.4)] bg-[linear-gradient(135deg,rgba(0,212,255,0.15),rgba(123,47,247,0.15))] text-white'
                : 'border-white/10 bg-white/[0.04] text-[color:var(--color-muted)] hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white'
            }`}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {f.name}
            {f.version && <span className="ml-1 text-[color:var(--color-dim)]">{f.version}</span>}
          </motion.div>
        ))}
      </motion.div>

      <style>{`
        @keyframes activeGlow {
          0%, 100% { box-shadow: 0 0 16px rgba(0, 212, 255, 0.2), inset 0 1px 0 rgba(255,255,255,0.1); }
          50% { box-shadow: 0 0 26px rgba(123, 47, 247, 0.35), inset 0 1px 0 rgba(255,255,255,0.15); }
        }
        .active-tag { animation: activeGlow 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .active-tag { animation: none; } }
      `}</style>
    </section>
  )
}
