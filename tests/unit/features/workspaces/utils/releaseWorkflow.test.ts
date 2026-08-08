import { describe, expect, it } from 'vitest';
import { canTransitionToStatus, validateReleaseForReview } from '@/features/workspaces/utils/releaseWorkflow';

describe('release workflow', () => {
  it('allows review only when required fields are filled', () => {
    const valid = validateReleaseForReview({
      title: 'Release 1.0',
      version: '1.0.0',
      changes: [{ category: 'feature', description: 'Added support' }],
      reviewers: [{ id: '1' }],
    });

    expect(valid.isValid).toBe(true);
    expect(valid.errors).toHaveLength(0);
  });

  it('blocks review when any required data is missing', () => {
    const invalid = validateReleaseForReview({
      title: 'Release 1.0',
      version: '',
      changes: [{ category: 'feature', description: '' }],
      reviewers: [],
    });

    expect(invalid.isValid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'У релиза должна быть указана версия',
      'Все изменения должны иметь категорию и описание',
      'Нужно назначить хотя хотя бы одного согласующего',
    ]));
  });

  it('restricts transitions to the defined lifecycle', () => {
    expect(canTransitionToStatus('draft', 'review')).toBe(true);
    expect(canTransitionToStatus('review', 'approved')).toBe(true);
    expect(canTransitionToStatus('review', 'rejected')).toBe(true);
    expect(canTransitionToStatus('rejected', 'draft')).toBe(true);
    expect(canTransitionToStatus('approved', 'published')).toBe(true);
    expect(canTransitionToStatus('published', 'draft')).toBe(false);
    expect(canTransitionToStatus('draft', 'approved')).toBe(false);
  });
});
