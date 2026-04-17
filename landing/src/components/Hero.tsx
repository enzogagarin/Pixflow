import { motion, type Variants } from 'framer-motion'

const container: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
}

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] },
  },
}

export function Hero() {
  return (
    <section className="relative z-[1] flex min-h-screen flex-col items-center justify-center px-6 pt-[140px] pb-[100px] text-center">
      <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col items-center">
        <motion.div
          variants={item}
          className="mb-8 inline-flex items-center gap-[10px] rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[1.5px] text-[color:var(--color-text)] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[14px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span className="relative flex h-[7px] w-[7px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-accent-1)] opacity-75" />
            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[color:var(--color-accent-1)] shadow-[0_0_10px_#00d4ff]" />
          </span>
          WebGPU Native
        </motion.div>

        <motion.h1
          variants={item}
          className="mb-[26px] max-w-[900px] text-[clamp(44px,7.5vw,92px)] font-extrabold leading-[1.02] tracking-[-3px] text-gradient-white"
        >
          process images
          <br />
          <span className="text-gradient inline-block">on the GPU.</span>
          <br />
          in the browser.
        </motion.h1>

        <motion.p
          variants={item}
          className="mb-11 max-w-[620px] text-[19px] leading-[1.65] text-[color:var(--color-muted)]"
        >
          Resize, filter, and encode hundreds of images in seconds. Zero server uploads. Zero privacy leaks. Pure
          client-side GPU compute.
        </motion.p>

        <motion.div variants={item} className="flex flex-wrap justify-center gap-[14px]">
          <motion.a
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href="https://github.com/enzogagarin/Pixflow"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full border border-transparent px-7 py-[14px] text-[14.5px] font-semibold tracking-[-0.1px] text-white no-underline shadow-[0_8px_30px_rgba(0,212,255,0.3),0_2px_8px_rgba(123,47,247,0.25)] transition-[filter,box-shadow] duration-200 bg-gradient-accent hover:brightness-110 hover:shadow-[0_12px_40px_rgba(0,212,255,0.45),0_4px_12px_rgba(123,47,247,0.35)]"
          >
            Get Started →
          </motion.a>
          <motion.a
            whileHover={{ y: -2, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href="#code"
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.18] bg-white/[0.04] px-7 py-[14px] text-[14.5px] font-semibold tracking-[-0.1px] text-white no-underline backdrop-blur-[14px] transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.07]"
          >
            See it in action
          </motion.a>
        </motion.div>
      </motion.div>
    </section>
  )
}
