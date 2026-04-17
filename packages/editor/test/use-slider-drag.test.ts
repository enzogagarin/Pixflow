// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { produce } from 'immer';
import { useSliderDrag } from '../src/hooks/useSliderDrag';
import { useEditStore } from '../src/state/store';

const dummyBitmap = {} as unknown as ImageBitmap;
const dummyFile = new File([], 'test.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  useEditStore.getState().clear();
  useEditStore.getState().loadImage(dummyFile, dummyBitmap, {}, 100, 100);
});

describe('useSliderDrag', () => {
  it('first onValueChange captures the pre-drag baseline and fires setPresent (no history push)', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    const initialPast = useEditStore.getState().document!.past;
    act(() => {
      result.current.onValueChange(0.2);
    });
    expect(useEditStore.getState().document!.present.color.brightness).toBe(0.2);
    expect(useEditStore.getState().document!.past).toBe(initialPast);
  });

  it('subsequent onValueChange calls keep updating present without pushing history', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    act(() => result.current.onValueChange(0.1));
    act(() => result.current.onValueChange(0.2));
    act(() => result.current.onValueChange(0.3));
    expect(useEditStore.getState().document!.present.color.brightness).toBe(0.3);
    expect(useEditStore.getState().document!.past).toHaveLength(0);
  });

  it('onValueCommit fires commit() with the captured baseline (one history entry per gesture)', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    const baseline = useEditStore.getState().document!.present;
    act(() => result.current.onValueChange(0.1));
    act(() => result.current.onValueChange(0.2));
    act(() => result.current.onValueCommit(0.2));
    const doc = useEditStore.getState().document!;
    expect(doc.past).toHaveLength(1);
    expect(doc.past[0]).toBe(baseline);
    expect(doc.present.color.brightness).toBe(0.2);
  });

  it('after commit, the next onValueChange captures a NEW baseline', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    act(() => result.current.onValueChange(0.2));
    act(() => result.current.onValueCommit(0.2));
    const afterFirstCommit = useEditStore.getState().document!.present;
    act(() => result.current.onValueChange(0.5));
    act(() => result.current.onValueCommit(0.5));
    const doc = useEditStore.getState().document!;
    expect(doc.past).toHaveLength(2);
    expect(doc.past[1]).toBe(afterFirstCommit);
  });

  it('reset() commits a single transition from the current present to the resetValue', () => {
    const { result } = renderHook(() =>
      useSliderDrag({
        getNextState: (v: number) =>
          produce(useEditStore.getState().document!.present, (d) => {
            d.color.brightness = v;
          }),
      }),
    );
    act(() => result.current.onValueChange(0.4));
    act(() => result.current.onValueCommit(0.4));
    const beforeReset = useEditStore.getState().document!.present;
    act(() => result.current.reset(0));
    const doc = useEditStore.getState().document!;
    expect(doc.present.color.brightness).toBe(0);
    expect(doc.past[doc.past.length - 1]).toBe(beforeReset);
  });
});
