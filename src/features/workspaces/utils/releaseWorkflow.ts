export type ReleaseStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published';

export interface ReleaseWorkflowValidationResult {
  isValid: boolean;
  errors: string[];
}

export const allowedReleaseTransitions: Record<ReleaseStatus, ReleaseStatus[]> = {
  draft: ['review'],
  review: ['approved', 'rejected'],
  approved: ['published'],
  rejected: ['draft'],
  published: ['draft', 'published'],
};

export const validateReleaseForReview = ({
  title,
  version,
  changes,
  reviewers,
}: {
  title?: string | null;
  version?: string | null;
  changes?: Array<{ category?: string | null; description?: string | null }> | null;
  reviewers?: Array<unknown> | null;
}): ReleaseWorkflowValidationResult => {
  const errors: string[] = [];

  if (!title?.trim()) {
    errors.push('У релиза должно быть название');
  }

  if (!version?.trim()) {
    errors.push('У релиза должна быть указана версия');
  }

  if (!changes || changes.length === 0) {
    errors.push('Нужно добавить хотя бы одно изменение');
  } else {
    const invalidChanges = changes.filter((change) => !change.category || !change.description?.trim());
    if (invalidChanges.length > 0) {
      errors.push('Все изменения должны иметь категорию и описание');
    }
  }

  if (!reviewers || reviewers.length === 0) {
    errors.push('Нужно назначить хотя хотя бы одного согласующего');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

type ReviewDecision = 'approved' | 'rejected' | 'pending';

export const getReviewOutcome = (reviewers?: Array<{ decision?: string | null }> | null): ReviewDecision => {
  if (!reviewers || reviewers.length === 0) {
    return 'pending';
  }

  if (reviewers.some((reviewer) => reviewer.decision === 'rejected')) {
    return 'rejected';
  }

  if (reviewers.every((reviewer) => reviewer.decision === 'approved')) {
    return 'approved';
  }

  return 'pending';
};

export const canTransitionToStatus = (currentStatus: ReleaseStatus, nextStatus: ReleaseStatus) => {
  return allowedReleaseTransitions[currentStatus]?.includes(nextStatus) ?? false;
};

export const getReleaseStatusLabel = (status: ReleaseStatus) => {
  const labels: Record<ReleaseStatus, string> = {
    draft: 'Draft',
    review: 'Review',
    approved: 'Approved',
    rejected: 'Rejected',
    published: 'Published',
  };

  return labels[status];
};
