export function Footer() {
  return (
    <footer
      className="relative z-[1] flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[rgba(5,6,13,0.6)] px-8 py-9 text-xs text-[color:var(--color-dim)] backdrop-blur-[14px]"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span>pixflow — WebGPU image processing</span>
      <span>
        built by{' '}
        <a
          href="https://github.com/enzogagarin"
          target="_blank"
          rel="noopener"
          className="text-[color:var(--color-muted)] no-underline transition-colors duration-200 hover:text-gradient"
        >
          @enzogagarin
        </a>
      </span>
    </footer>
  )
}
