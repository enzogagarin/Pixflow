import { motion, type Variants } from 'framer-motion'

const K = ({ children }: { children: React.ReactNode }) => (
  <span className="font-medium text-[#c792ea]">{children}</span>
)
const F = ({ children }: { children: React.ReactNode }) => <span className="text-[#82aaff]">{children}</span>
const S = ({ children }: { children: React.ReactNode }) => <span className="text-[#c3e88d]">{children}</span>
const C = ({ children }: { children: React.ReactNode }) => <span className="italic text-[#5c6773]">{children}</span>
const N = ({ children }: { children: React.ReactNode }) => <span className="text-[#f78c6c]">{children}</span>
const V = ({ children }: { children: React.ReactNode }) => <span className="text-[#eeffff]">{children}</span>

const lines: React.ReactNode[] = [
  <>
    <K>import</K> {'{ '}
    <F>Pipeline</F>
    {' }'} <K>from</K> <S>'pixflow'</S>
  </>,
  <>&nbsp;</>,
  <C>// 100 images. GPU-processed. Under 3 seconds.</C>,
  <>&nbsp;</>,
  <>
    <K>const</K> <V>pipe</V> = <F>Pipeline</F>.<F>create</F>()
  </>,
  <>
    &nbsp;&nbsp;.<F>orient</F>()
  </>,
  <>
    &nbsp;&nbsp;.<F>resize</F>({'({ '}
    <V>width</V>: <N>800</N>, <V>fit</V>: <S>'contain'</S>
    {' })'}
  </>,
  <>
    &nbsp;&nbsp;.<F>brightness</F>(<N>0.05</N>)
  </>,
  <>
    &nbsp;&nbsp;.<F>unsharpMask</F>({'({ '}
    <V>amount</V>: <N>0.3</N>, <V>radius</V>: <N>1.0</N>
    {' })'}
  </>,
  <>
    &nbsp;&nbsp;.<F>encode</F>({'({ '}
    <V>format</V>: <S>'webp'</S>, <V>quality</V>: <N>0.85</N>
    {' })'}
  </>,
  <>&nbsp;</>,
  <>
    <K>const</K> <V>results</V> = <K>await</K> <V>pipe</V>.<F>batch</F>(<V>files</V>, {'{'}
  </>,
  <>
    &nbsp;&nbsp;<V>concurrency</V>: <N>4</N>,
  </>,
  <>
    &nbsp;&nbsp;<V>onProgress</V>: (<V>done</V>, <V>total</V>) <K>{'=>'}</K> <F>updateUI</F>(<V>done</V>,{' '}
    <V>total</V>)
  </>,
  <>{'})'}</>,
  <>&nbsp;</>,
  <C>{'// results[i] → { blob, width, height, stats }'}</C>,
]

const lineVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: [0.2, 0.8, 0.2, 1] },
  }),
}

export function CodeShowcase() {
  return (
    <section id="code" className="relative z-[1] flex justify-center px-6 py-20 pt-20 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative w-full max-w-[780px] overflow-hidden rounded-[18px] border border-white/10 bg-[rgba(10,11,26,0.55)] shadow-[0_20px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08),0_0_60px_rgba(0,212,255,0.06)] backdrop-blur-[22px] backdrop-saturate-[150%]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[18px] opacity-60"
          style={{
            padding: '1px',
            background:
              'linear-gradient(135deg, rgba(0,212,255,0.3), transparent 40%, transparent 60%, rgba(123,47,247,0.3))',
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
        />
        <div
          className="flex items-center gap-2 border-b border-white/[0.06] bg-black/20 px-5 py-[14px] text-xs text-[color:var(--color-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
          <span className="ml-3 font-medium">pipeline.ts</span>
        </div>
        <div
          className="overflow-x-auto px-7 py-[26px] text-[13.5px] leading-[1.9]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {lines.map((line, i) => (
            <motion.div
              key={i}
              custom={i}
              variants={lineVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
            >
              {line}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
