import { motion, useScroll, useTransform } from 'framer-motion'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

interface OrbConfig {
  size: number
  color: string
  top?: string
  left?: string
  right?: string
  bottom?: string
  opacity: number
  duration: number
  delay: number
  parallax: number
}

const orbs: OrbConfig[] = [
  {
    size: 560,
    color: '#7b2ff7',
    top: '-120px',
    left: '-120px',
    opacity: 0.55,
    duration: 24,
    delay: 0,
    parallax: 0.15,
  },
  {
    size: 480,
    color: '#00d4ff',
    top: '30%',
    right: '-160px',
    opacity: 0.55,
    duration: 30,
    delay: -8,
    parallax: 0.08,
  },
  {
    size: 520,
    color: '#ff4ecd',
    bottom: '-140px',
    left: '30%',
    opacity: 0.4,
    duration: 28,
    delay: -16,
    parallax: 0.12,
  },
  {
    size: 380,
    color: '#00d4ff',
    top: '60%',
    left: '10%',
    opacity: 0.35,
    duration: 32,
    delay: -12,
    parallax: 0.05,
  },
]

export function AnimatedBackground() {
  const reduced = usePrefersReducedMotion()
  const { scrollY } = useScroll()

  return (
    <div className="pointer-events-none fixed inset-0 -z-[1] overflow-hidden" aria-hidden="true">
      {orbs.map((orb, i) => (
        <Orb key={i} orb={orb} reduced={reduced} scrollY={scrollY} />
      ))}
    </div>
  )
}

function Orb({
  orb,
  reduced,
  scrollY,
}: {
  orb: OrbConfig
  reduced: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scrollY: any
}) {
  const y = useTransform(scrollY, [0, 2000], [0, 2000 * orb.parallax])

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: orb.size,
        height: orb.size,
        top: orb.top,
        left: orb.left,
        right: orb.right,
        bottom: orb.bottom,
        background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
        filter: 'blur(90px)',
        opacity: orb.opacity,
        willChange: 'transform',
        y: reduced ? 0 : y,
      }}
      animate={
        reduced
          ? undefined
          : {
              x: [0, 60, -40, 0],
              y: [0, -40, 50, 0],
              scale: [1, 1.08, 0.95, 1],
            }
      }
      transition={
        reduced
          ? undefined
          : {
              duration: orb.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: orb.delay,
            }
      }
    />
  )
}
