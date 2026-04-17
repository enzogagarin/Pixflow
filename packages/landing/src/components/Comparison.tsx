import { motion } from 'framer-motion'
import { SectionLabel } from './SectionLabel'

type Cell = { text: string; highlight?: boolean; dim?: boolean }

const rows: { label: string; cells: [Cell, Cell, Cell] }[] = [
  {
    label: 'Runtime',
    cells: [
      { text: 'Browser GPU', highlight: true },
      { text: 'Browser CPU', dim: true },
      { text: 'Node.js server', dim: true },
    ],
  },
  {
    label: 'Privacy',
    cells: [
      { text: 'Client-side', highlight: true },
      { text: 'Client-side', dim: true },
      { text: 'Server upload', dim: true },
    ],
  },
  {
    label: '100 imgs 2K→800',
    cells: [
      { text: '<3s', highlight: true },
      { text: '~45s', dim: true },
      { text: '~8s (server)', dim: true },
    ],
  },
  {
    label: 'Server cost',
    cells: [
      { text: '$0', highlight: true },
      { text: '$0', highlight: true },
      { text: '$$ per GB', dim: true },
    ],
  },
  {
    label: 'WGSL shaders',
    cells: [
      { text: 'Yes', highlight: true },
      { text: 'No', dim: true },
      { text: 'No', dim: true },
    ],
  },
  {
    label: 'Batch API',
    cells: [
      { text: 'Built-in', highlight: true },
      { text: 'Manual', dim: true },
      { text: 'Manual', dim: true },
    ],
  },
]

function CellContent({ cell }: { cell: Cell }) {
  if (cell.highlight) return <span className="font-semibold text-gradient">{cell.text}</span>
  return <span className="text-[color:var(--color-muted)]">{cell.text}</span>
}

export function Comparison() {
  return (
    <section className="relative z-[1] mx-auto max-w-[960px] px-6 py-[120px]">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <SectionLabel>vs. alternatives</SectionLabel>
        <h2 className="text-[clamp(32px,4.5vw,52px)] font-extrabold leading-[1.1] tracking-[-1.5px] text-white">
          How pixflow compares.
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
        className="mt-10 overflow-x-auto rounded-[18px] border border-white/10 bg-white/[0.04] px-7 py-[14px] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[22px] backdrop-saturate-[150%]"
      >
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr>
              <th className="border-b border-white/10 px-3 pt-5 pb-4 text-left text-[12px] font-semibold uppercase tracking-[1.2px] text-[color:var(--color-muted)]"></th>
              <th className="border-b border-white/10 px-3 pt-5 pb-4 text-left text-[12px] font-semibold uppercase tracking-[1.2px] text-[color:var(--color-accent-1)]">
                pixflow
              </th>
              <th className="border-b border-white/10 px-3 pt-5 pb-4 text-left text-[12px] font-semibold uppercase tracking-[1.2px] text-[color:var(--color-muted)]">
                Canvas2D
              </th>
              <th className="border-b border-white/10 px-3 pt-5 pb-4 text-left text-[12px] font-semibold uppercase tracking-[1.2px] text-[color:var(--color-muted)]">
                Sharp.js
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className={`transition-colors duration-200 hover:bg-white/[0.02] ${
                  i < rows.length - 1 ? '' : '[&>td]:border-b-0'
                }`}
              >
                <td className="border-b border-white/[0.04] px-3 py-4 text-[color:var(--color-muted)] font-medium">
                  {row.label}
                </td>
                {row.cells.map((c, j) => (
                  <td
                    key={j}
                    className="border-b border-white/[0.04] px-3 py-4 text-[13px]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    <CellContent cell={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </section>
  )
}
