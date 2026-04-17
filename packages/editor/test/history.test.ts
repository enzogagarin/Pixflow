import { describe, it, expect } from 'vitest';
import {
  createHistory,
  commit,
  setPresent,
  undo,
  redo,
  HISTORY_MAX,
} from '../src/state/history';
import { makeState } from './test-helpers';

describe('createHistory', () => {
  it('returns a history with no past/future and the given present', () => {
    const s = makeState();
    const h = createHistory(s);
    expect(h.past).toEqual([]);
    expect(h.present).toBe(s);
    expect(h.future).toEqual([]);
  });
});

describe('commit', () => {
  it('pushes current present to past, sets next as present, clears future', () => {
    const s0 = makeState();
    const s1 = makeState({
      color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } },
    });
    const h0 = createHistory(s0);
    const h1 = commit(h0, s1);
    expect(h1.past).toEqual([s0]);
    expect(h1.present).toBe(s1);
    expect(h1.future).toEqual([]);
  });

  it('clears any pending future when a new commit is made (redo stack is invalidated)', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const s2 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const s3 = makeState({ color: { brightness: 0.3, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });

    let h = createHistory(s0);
    h = commit(h, s1);
    h = commit(h, s2);
    const undone = undo(h);
    expect(undone).not.toBeNull();
    expect(undone!.future).toHaveLength(1);
    const next = commit(undone!, s3);
    expect(next.future).toEqual([]);
    expect(next.past).toEqual([s0, s1]);
    expect(next.present).toBe(s3);
  });

  it('does not mutate the input history', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.2, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h0 = createHistory(s0);
    const pastRef = h0.past;
    commit(h0, s1);
    expect(h0.present).toBe(s0);
    expect(h0.past).toBe(pastRef);
  });

  it(`caps past at HISTORY_MAX (${HISTORY_MAX}) via FIFO eviction`, () => {
    const initial = makeState();
    let h = createHistory(initial);
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      const next = makeState({
        color: {
          brightness: i / 100,
          contrast: 0,
          saturation: 0,
          whiteBalance: { temperature: 0, tint: 0 },
        },
      });
      h = commit(h, next);
    }
    expect(h.past).toHaveLength(HISTORY_MAX);
    // The pushed sequence is [initial, c0, c1, ..., c53] = 55 entries.
    // FIFO eviction drops the first 5, leaving past[0] = c4 (brightness=0.04).
    expect(h.past[0]?.color.brightness).toBeCloseTo(4 / 100);
  });
});

describe('setPresent', () => {
  it('replaces present without touching past or future', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.5, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h0 = createHistory(s0);
    const h1 = setPresent(h0, s1);
    expect(h1.past).toBe(h0.past);
    expect(h1.present).toBe(s1);
    expect(h1.future).toBe(h0.future);
  });
});

describe('undo', () => {
  it('returns null when past is empty (no-op signal to caller)', () => {
    const h = createHistory(makeState());
    expect(undo(h)).toBeNull();
  });

  it('pops last past entry into present, pushes previous present to future head', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h1 = commit(createHistory(s0), s1);
    const h0 = undo(h1);
    expect(h0).not.toBeNull();
    expect(h0!.past).toEqual([]);
    expect(h0!.present).toBe(s0);
    expect(h0!.future).toEqual([s1]);
  });
});

describe('redo', () => {
  it('returns null when future is empty', () => {
    const h = createHistory(makeState());
    expect(redo(h)).toBeNull();
  });

  it('pops future head into present, pushes previous present to past tail', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const afterCommit = commit(createHistory(s0), s1);
    const afterUndo = undo(afterCommit);
    expect(afterUndo).not.toBeNull();
    const afterRedo = redo(afterUndo!);
    expect(afterRedo).not.toBeNull();
    expect(afterRedo!.past).toEqual([s0]);
    expect(afterRedo!.present).toBe(s1);
    expect(afterRedo!.future).toEqual([]);
  });
});

describe('round-trip: commit → undo → redo returns equivalent history', () => {
  it('state identity is preserved (same object refs) across undo/redo cycle', () => {
    const s0 = makeState();
    const s1 = makeState({ color: { brightness: 0.1, contrast: 0, saturation: 0, whiteBalance: { temperature: 0, tint: 0 } } });
    const h1 = commit(createHistory(s0), s1);
    const h0 = undo(h1);
    const hBack = redo(h0!);
    expect(hBack!.present).toBe(s1);
    expect(hBack!.past[0]).toBe(s0);
  });
});
