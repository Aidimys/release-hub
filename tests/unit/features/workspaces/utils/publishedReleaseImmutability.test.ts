import { describe, expect, it } from 'vitest';
import { canTransitionToStatus, validateReleaseForReview } from '@/features/workspaces/utils/releaseWorkflow';

describe('published release immutability', () => {
  it('blocks all transitions from published status', () => {
    expect(canTransitionToStatus('published', 'draft')).toBe(false);
    expect(canTransitionToStatus('published', 'review')).toBe(false);
    expect(canTransitionToStatus('published', 'approved')).toBe(false);
    expect(canTransitionToStatus('published', 'rejected')).toBe(false);
    expect(canTransitionToStatus('published', 'published')).toBe(false);
  });

  it('blocks review validation for a release with empty title', () => {
    const result = validateReleaseForReview({
      title: '',
      version: '1.0.0',
      changes: [{ category: 'feature', description: 'Change' }],
      reviewers: [{ id: '1' }],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('У релиза должно быть название');
  });

  it('blocks review when changes are missing required fields', () => {
    const result = validateReleaseForReview({
      title: 'Release',
      version: '1.0.0',
      changes: [
        { category: 'feature', description: '' },
        { category: '', description: 'Missing category' },
      ],
      reviewers: [{ id: '1' }],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Все изменения должны иметь категорию и описание');
  });

  it('requires at least one reviewer', () => {
    const result = validateReleaseForReview({
      title: 'Release',
      version: '1.0.0',
      changes: [{ category: 'feature', description: 'Change' }],
      reviewers: [],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Нужно назначить хотя хотя бы одного согласующего');
  });

  it('requires at least one change', () => {
    const result = validateReleaseForReview({
      title: 'Release',
      version: '1.0.0',
      changes: [],
      reviewers: [{ id: '1' }],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Нужно добавить хотя бы одно изменение');
  });
});
