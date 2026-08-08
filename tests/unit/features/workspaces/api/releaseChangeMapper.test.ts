import { describe, expect, it } from 'vitest';
import { mapReleaseChangeRowToModel } from '@/features/workspaces/api/releaseChangeMapper';

describe('mapReleaseChangeRowToModel', () => {
  it('maps SQL row to domain model with authorName from profiles', () => {
    const row = {
      id: 'c1',
      release_id: 'r1',
      category: 'feature',
      title: 'Added feature',
      description: 'A new feature',
      position: 1,
      created_by: 'user1',
      created_at: '2026-08-02T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
      profiles: { display_name: 'Author Name' },
    } as const;

    const model = mapReleaseChangeRowToModel(row);

    expect(model.authorName).toBe('Author Name');
    expect(model.id).toBe('c1');
    expect(model.position).toBe(1);
  });

  it('falls back to null when profiles are missing', () => {
    const row = {
      id: 'c2',
      release_id: 'r1',
      category: 'bugfix',
      title: 'Fixed bug',
      description: 'Bugfix',
      position: 0,
      created_by: null,
      created_at: '2026-08-02T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
      profiles: null,
    } as const;

    const model = mapReleaseChangeRowToModel(row);

    expect(model.authorName).toBeNull();
  });
});
