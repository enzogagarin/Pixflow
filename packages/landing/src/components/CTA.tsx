import { motion } from 'framer-motion'

export function CTA() {
  return (
    <section className="relative z-[1] flex justify-center px-6 py-[140px]">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative w-full max-w-[1100px] overflow-hidden rounded-[28px] border border-white/[0.18] bg-[linear-gradient(135deg,rgba(0,212,255,0.12)_0%,rgba(123,47,247,0.18)_50%,rgba(255,78,205,0.1)_100%),rgba(10,11,26,0.4)] px-10 py-[90px] text-center shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12),0_0_80px_rgba(123,47,247,0.15)] backdrop-blur-[28px] backdrop-saturate-[160%]"
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(ellipse 50% 50% at 20% 20%, rgba(0,212,255,0.18), transparent 60%), radial-gradient(ellipse 50% 50% at 80% 80%, rgba(123,47,247,0.22), transparent 60%)',
          }}
        />
        <div className="relative z-[1]">
          <h2 className="mb-[18px] text-[clamp(34px,5vw,60px)] font-extrabold leading-[1.05] tracking-[-2px] text-white">
            Stop uploading images
            <br />
            <span className="text-gradient">to resize them.</span>
          </h2>
          <p className="mx-auto mb-10 max-w-[560px] text-[17px] text-[color:var(--color-muted)]">
            Your users' GPUs are idle. Their photos are on your server. Fix both.
          </p>
          <div className="flex flex-wrap justify-center gap-[14px]">
            <motion.a
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              href="https://github.com/enzogagarin/Pixflow"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-full border border-transparent px-7 py-[14px] text-[14.5px] font-semibold tracking-[-0.1px] text-white no-underline shadow-[0_8px_30px_rgba(0,212,255,0.3),0_2px_8px_rgba(123,47,247,0.25)] transition-[filter,box-shadow] duration-200 bg-gradient-accent hover:brightness-110 hover:shadow-[0_12px_40px_rgba(0,212,255,0.45),0_4px_12px_rgba(123,47,247,0.35)]"
            >
              View on GitHub →
            </motion.a>
            <motion.a
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              href="https://www.npmjs.com/package/pixflow"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.04] px-7 py-[14px] text-[14.5px] font-semibold tracking-[-0.1px] text-white no-underline backdrop-blur-[14px] transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.07]"
            >
              npm install pixflow
            </motion.a>
          </div>
          <div
            className="mt-11 flex flex-wrap items-center justify-center gap-6 text-[12.5px] text-[color:var(--color-dim)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <a
              href="https://github.com/enzogagarin/Pixflow/blob/main/DESIGN.md"
              className="text-[color:var(--color-muted)] no-underline transition-colors duration-200 hover:text-white"
            >
              Design Doc
            </a>
            <span>•</span>
            <a
              href="https://github.com/enzogagarin/Pixflow/blob/main/README.md"
              className="text-[color:var(--color-muted)] no-underline transition-colors duration-200 hover:text-white"
            >
              API Reference
            </a>
            <span>•</span>
            <a
              href="https://github.com/enzogagarin/Pixflow/blob/main/LICENSE"
              className="text-[color:var(--color-muted)] no-underline transition-colors duration-200 hover:text-white"
            >
              MIT License
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  )
}
