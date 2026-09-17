import { describe, expect, it } from 'vitest';

import { loadDesignSnapshot, saveDesignSnapshot } from '../designSnapshot';
import type { FloorPlan } from '@/types/design';

const floor: FloorPlan = {
  id: 'saved-design', name: 'Saved design', width: 6000, height: 4000, scale: 100,
  walls: [], rooms: [], doors: [], windows: [], objects: [], createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
};

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}

describe('design snapshots', () => {
  it('restores a saved editor design and Date metadata', () => {
    const storage = memoryStorage();
    saveDesignSnapshot(storage, floor, null, 0.25);

    const snapshot = loadDesignSnapshot(storage);
    expect(snapshot?.floorPlan.name).toBe('Saved design');
    expect(snapshot?.floorPlan.updatedAt).toBeInstanceOf(Date);
  });

  it('preserves the optional image-first trace reference', () => {
    const storage = memoryStorage();
    saveDesignSnapshot(storage, floor, null, 0.25, {
      url: 'https://example.test/reference.png', scale: 0.7, opacity: 0.58, blur: 2,
    });

    expect(loadDesignSnapshot(storage)?.traceImage).toEqual({
      url: 'https://example.test/reference.png', scale: 0.7, opacity: 0.58, blur: 2,
    });
  });

  it('removes corrupted saved data', () => {
    const storage = memoryStorage();
    storage.setItem('corbel:editor-design:v1', 'invalid');
    expect(loadDesignSnapshot(storage)).toBeNull();
    expect(storage.getItem('corbel:editor-design:v1')).toBeNull();
  });
});
