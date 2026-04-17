import { useEditStore } from '../../state/store';
import { WatermarkConfig } from './WatermarkConfig';

/**
 * Overlay inspector section. Houses two subgroups per spec Section 4:
 *   - Watermark (live this PR)
 *   - Face blur (stubbed; arrives with PR #10's face-detect service)
 *
 * The face-blur stub is intentionally rendered (greyed out) so users
 * see the eventual feature surface and roadmap signaling.
 */
export function OverlaySection() {
  const document = useEditStore((s) => s.document);
  if (!document) return null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <WatermarkConfig />

      <div className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 opacity-50">
        <span className="font-[var(--font-mono)] text-xs">Face blur</span>
        <p className="font-[var(--font-mono)] text-[10px] text-[var(--color-muted)]">
          Face detection ships in PR #10 (BlazeFace + safety review UI).
        </p>
      </div>
    </div>
  );
}
