export type ReleaseChangeCategory = 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking';

export interface ReleaseChangeSummary {
  id: string;
  category: ReleaseChangeCategory;
  title: string;
  description: string;
  position: number;
}

export interface GroupedReleaseChange {
  category: ReleaseChangeCategory;
  label: string;
  changes: ReleaseChangeSummary[];
}

const categoryLabels: Record<ReleaseChangeCategory, string> = {
  feature: 'Новые возможности',
  improvement: 'Улучшения',
  bugfix: 'Исправления',
  security: 'Безопасность',
  breaking: 'Критические изменения',
};

const categoryOrder: ReleaseChangeCategory[] = ['feature', 'improvement', 'bugfix', 'security', 'breaking'];

export const groupReleaseChangesByCategory = (changes: ReleaseChangeSummary[]): GroupedReleaseChange[] => {
  const groups = new Map<ReleaseChangeCategory, ReleaseChangeSummary[]>();

  changes.forEach((change) => {
    const key = change.category;
    const bucket = groups.get(key) ?? [];
    bucket.push(change);
    groups.set(key, bucket);
  });

  const orderedKeys = categoryOrder.filter((key) => groups.has(key));
  const extraKeys = Array.from(groups.keys()).filter((key) => !categoryOrder.includes(key));

  return [
    ...orderedKeys.map((key) => ({
      category: key,
      label: categoryLabels[key],
      changes: (groups.get(key) ?? []).slice().sort((a, b) => a.position - b.position),
    })),
    ...extraKeys.map((key) => ({
      category: key,
      label: key,
      changes: (groups.get(key) ?? []).slice().sort((a, b) => a.position - b.position),
    })),
  ];
};
