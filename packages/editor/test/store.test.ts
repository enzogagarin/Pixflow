import { describe, it, expect, beforeEach } from 'vitest';
import { useEditStore } from '../src/state/store';
import { makeState } from './test-helpers';

const dummyBitmap = {} as unknown as ImageBitmap;
const dummyFile = new File([], 'test.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  useEditStore.getState().clear();
});

describe('useEditStore', () => {
  it('starts with document = null (no image loaded)', () => {
    expect(useEditStore.getState().document).toBeNull();
  });

  describe('loadImage', () => {
    it('seeds document with freshState wrapped in empty history', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const doc = useEditStore.getState().document;
      expect(doc).not.toBeNull();
      expect(doc!.past).toEqual([]);
      expect(doc!.future).toEqual([]);
      expect(doc!.present.source.file).toBe(dummyFile);
      expect(doc!.present.source.naturalWidth).toBe(1920);
      expect(doc!.present.color.brightness).toBe(0);
    });

    it('replaces any existing document (opening a new file starts fresh)', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const s1 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().commit(s1);
      expect(useEditStore.getState().document!.past).toHaveLength(1);

      const dummyBitmap2 = {} as unknown as ImageBitmap;
      const dummyFile2 = new File([], 'other.jpg', { type: 'image/jpeg' });
      useEditStore.getState().loadImage(dummyFile2, dummyBitmap2, {}, 800, 600);
      const doc = useEditStore.getState().document!;
      expect(doc.past).toEqual([]);
      expect(doc.present.source.file).toBe(dummyFile2);
    });
  });

  describe('setPresent', () => {
    it('updates present without touching past or future', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const before = useEditStore.getState().document!;
      const next = makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().setPresent(next);
      const after = useEditStore.getState().document!;
      expect(after.present.color.brightness).toBe(0.5);
      expect(after.past).toEqual(before.past);
      expect(after.future).toEqual(before.future);
    });

    it('is a no-op when document is null', () => {
      const next = makeState();
      useEditStore.getState().setPresent(next);
      expect(useEditStore.getState().document).toBeNull();
    });
  });

  describe('commit', () => {
    it('pushes current present to past and sets next (default baseline path)', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const originalBrightness = useEditStore.getState().document!.present.color.brightness;
      const next = makeState({ color: { brightness: 0.3, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().commit(next);
      const doc = useEditStore.getState().document!;
      expect(doc.past).toHaveLength(1);
      expect(doc.past[0]?.color.brightness).toBe(originalBrightness);
      expect(doc.present.color.brightness).toBe(0.3);
    });

    it('uses options.baseline when provided (slider-drag discipline)', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const s0 = useEditStore.getState().document!.present;
      const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      const s2 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().setPresent(s1);
      useEditStore.getState().setPresent(s2);
      useEditStore.getState().commit(s2, { baseline: s0 });
      const doc = useEditStore.getState().document!;
      expect(doc.past).toHaveLength(1);
      expect(doc.past[0]).toBe(s0);
      expect(doc.present).toBe(s2);
    });

    it('is a no-op when document is null', () => {
      useEditStore.getState().commit(makeState());
      expect(useEditStore.getState().document).toBeNull();
    });
  });

  describe('undo / redo', () => {
    it('undo reverts to previous state; redo re-applies', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const s0Brightness = useEditStore.getState().document!.present.color.brightness;
      const s1 = makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
      useEditStore.getState().commit(s1);

      useEditStore.getState().undo();
      expect(useEditStore.getState().document!.present.color.brightness).toBe(s0Brightness);

      useEditStore.getState().redo();
      expect(useEditStore.getState().document!.present.color.brightness).toBe(0.5);
    });

    it('undo is a silent no-op when past is empty', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const before = useEditStore.getState().document!;
      useEditStore.getState().undo();
      expect(useEditStore.getState().document!.present).toBe(before.present);
      expect(useEditStore.getState().document!.past).toEqual([]);
    });

    it('redo is a silent no-op when future is empty', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      const before = useEditStore.getState().document!;
      useEditStore.getState().redo();
      expect(useEditStore.getState().document!.present).toBe(before.present);
      expect(useEditStore.getState().document!.future).toEqual([]);
    });

    it('undo and redo are no-ops when document is null', () => {
      useEditStore.getState().undo();
      useEditStore.getState().redo();
      expect(useEditStore.getState().document).toBeNull();
    });
  });

  describe('clear', () => {
    it('resets document to null', () => {
      useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 1920, 1080);
      expect(useEditStore.getState().document).not.toBeNull();
      useEditStore.getState().clear();
      expect(useEditStore.getState().document).toBeNull();
    });
  });
});
