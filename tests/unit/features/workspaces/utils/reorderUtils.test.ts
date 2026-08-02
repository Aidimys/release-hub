import { describe, expect, it } from 'vitest';
import { reorderItems } from '@/features/workspaces/utils/reorderUtils';

describe('reorderItems', () => {
  it('moves an item and renormalizes positions', () => {
    const items = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ];

    const result = reorderItems(items, 'a', 'c');

    expect(result.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((item) => item.position)).toEqual([0, 1, 2]);
  });

  it('normalizes positions even when no move is performed', () => {
    const items = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ];

    const result = reorderItems(items, 'a', 'a');

    expect(result).toEqual([
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]);
  });
});
