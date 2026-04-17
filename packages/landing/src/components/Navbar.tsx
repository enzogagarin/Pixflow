import { motion, useMotionValueEvent, useScroll } from 'framer-motion'
import { useState } from 'react'

const LogoIcon = () => (
  <div
    className="grid h-[26px] w-[26px] grid-cols-3 grid-rows-3 gap-[2px] rounded-lg p-1 shadow-[0_0_20px_rgba(0,212,255,0.35)] bg-gradient-accent"
    aria-hidden="true"
  >
    {Array.from({ length: 9 }).map((_, i) => (
      <span
        key={i}
        className={`rounded-[1px] ${i === 4 ? 'bg-transparent' : 'bg-white/90'}`}
      />
    ))}
  </div>
)

const links = [
  { href: '#why', label: 'Why' },
  { href: '#pipeline', label: 'How' },
  { href: '#benchmarks', label: 'Benchmarks' },
  { href: '#filters', label: 'Filters' },
]

export function Navbar() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)

  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > 30)
  })

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className={`fixed left-1/2 z-[100] flex w-[calc(100%-32px)] max-w-[1200px] -translate-x-1/2 items-center justify-between rounded-full border border-white/10 transition-[padding,top,background,box-shadow,backdrop-filter] duration-300 ${
        scrolled
          ? 'top-[10px] bg-[rgba(10,11,26,0.75)] px-5 py-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[26px] backdrop-saturate-[180%]'
          : 'top-4 bg-[rgba(10,11,26,0.55)] px-[22px] py-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[18px] backdrop-saturate-[160%]'
      }`}
    >
      <a
        href="#"
        className="flex items-center gap-[10px] text-[17px] font-bold tracking-[-0.3px] text-white no-underline"
      >
        <LogoIcon />
        pixflow
      </a>
      <ul className="flex list-none items-center gap-[6px] p-0">
        {links.map((l) => (
          <li key={l.href} className="hidden sm:block">
            <a
              href={l.href}
              className="rounded-full px-[14px] py-2 text-[13.5px] font-medium text-[color:var(--color-muted)] no-underline transition-colors duration-200 hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          </li>
        ))}
        <li>
          <motion.a
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            href="https://github.com/enzogagarin/Pixflow"
            target="_blank"
            rel="noopener"
            className="ml-1 inline-block rounded-full px-[18px] py-[9px] text-[13px] font-semibold text-white no-underline shadow-[0_4px_20px_rgba(0,212,255,0.3)] transition-[filter,box-shadow] duration-200 bg-gradient-accent hover:brightness-110 hover:shadow-[0_6px_28px_rgba(123,47,247,0.45)]"
          >
            GitHub →
          </motion.a>
        </li>
      </ul>
    </motion.nav>
  )
}
