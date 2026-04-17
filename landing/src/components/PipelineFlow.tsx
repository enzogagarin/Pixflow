import { Fragment } from 'react'
import { motion, type Variants } from 'framer-motion'
import { SectionLabel } from './SectionLabel'

const steps: { label: string; highlight?: boolean }[] = [
  { label: 'File/Blob' },
  { label: 'ImageBitmap' },
  { label: 'GPUTexture' },
  { label: 'Filter N', highlight: true },
  { label: 'Canvas' },
  { label: 'WebP Blob' },
]

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] } },
}

const arrowFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 0.6, transition: { duration: 0.5 } },
}

export function PipelineFlow() {
  return (
    <section id="pipeline" className="relative z-[1] mx-auto max-w-[1200px] px-6 py-[120px] text-center">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="mb-[56px] flex flex-col items-center"
      >
        <SectionLabel>How it works</SectionLabel>
        <h2 className="text-[clamp(32px,4.5vw,52px)] font-extrabold leading-[1.1] tracking-[-1.5px] text-white">
          From file to WebP,
          <br />
          entirely on the GPU.
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="mx-auto flex max-w-[1000px] flex-wrap items-center justify-center gap-2"
      >
        {steps.map((step, i) => (
          <Fragment key={step.label}>
            <motion.div
              variants={fadeUp}
              whileHover={{ y: -3, scale: 1.04 }}
              className={`whitespace-nowrap rounded-full border px-[22px] py-[14px] text-[13px] font-medium shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[18px] backdrop-saturate-[150%] transition-[border-color,color,box-shadow] duration-300 ${
                step.highlight
                  ? 'border-[rgba(123,47,247,0.5)] bg-[linear-gradient(135deg,rgba(0,212,255,0.08),rgba(123,47,247,0.12))] text-white shadow-[0_0_30px_rgba(123,47,247,0.2),0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'border-white/10 bg-white/[0.04] text-[color:var(--color-text)] hover:border-[rgba(0,212,255,0.5)] hover:text-white hover:shadow-[0_10px_28px_rgba(0,0,0,0.4),0_0_30px_rgba(0,212,255,0.25)]'
              }`}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {step.label}
            </motion.div>
            {i < steps.length - 1 && (
              <motion.span
                variants={arrowFade}
                className="hidden px-[2px] text-base text-[color:var(--color-dim)] sm:inline-block"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                →
              </motion.span>
            )}
          </Fragment>
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="mx-auto mt-11 max-w-[640px] text-[15px] leading-[1.75] text-[color:var(--color-muted)]"
      >
        Each filter runs as a <strong className="font-semibold text-gradient">WGSL compute shader</strong> on the GPU.
        Intermediate textures use a ping-pong pattern — N filters only need 2 textures. Pipeline cache eliminates
        redundant shader compilation across batch items.
      </motion.p>
    </section>
  )
}
