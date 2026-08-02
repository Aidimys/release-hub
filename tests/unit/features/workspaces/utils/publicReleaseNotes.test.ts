import { describe, expect, it } from 'vitest';
import { groupReleaseChangesByCategory } from '@/features/workspaces/utils/publicReleaseNotes';

describe('groupReleaseChangesByCategory', () => {
  it('groups and orders changes by category', () => {
    const result = groupReleaseChangesByCategory([
      { id: '1', category: 'bugfix', title: 'Fix one', description: '', position: 2 },
      { id: '2', category: 'feature', title: 'Add a thing', description: '', position: 1 },
      { id: '3', category: 'feature', title: 'Add another thing', description: '', position: 3 },
    ]);

    expect(result.map((group) => group.category)).toEqual(['feature', 'bugfix']);
    expect(result[0].changes.map((change) => change.id)).toEqual(['2', '3']);
  });
});
