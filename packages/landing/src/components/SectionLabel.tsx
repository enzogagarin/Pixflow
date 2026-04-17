export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-5 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[3px] text-[color:var(--color-accent-1)]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className="inline-block h-px w-6 bg-gradient-accent" />
      {children}
    </div>
  )
}
