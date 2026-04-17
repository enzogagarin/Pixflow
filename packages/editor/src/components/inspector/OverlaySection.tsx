import { useEditStore } from '../../state/store';
import { WatermarkConfig } from './WatermarkConfig';
import { FaceBlurConfig } from './FaceBlurConfig';

/**
 * Overlay inspector section. Houses two subgroups per spec Section 4:
 *   - Watermark (PR #7)
 *   - Face blur (PR #10a: manual box picking + pixelate/gaussian; PR #10b
 *     adds BlazeFace auto-detection)
 */
export function OverlaySection() {
  const document = useEditStore((s) => s.document);
  if (!document) return null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <WatermarkConfig />
      <FaceBlurConfig />
    </div>
  );
}
