export const workspaceKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspaceKeys.all, 'list'] as const,
  detail: (id: string) => ['workspace', id] as const,
  members: (id: string) => ['workspace_members', id] as const,
  invites: (id: string) => ['workspace_invites', id] as const,
  products: (id: string) => ['products', id] as const,
  releases: (id: string) => ['workspace_releases', id] as const,
  activity: (id: string) => ['workspace_activity', id] as const,
};

export const productKeys = {
  all: ['product_releases'] as const,
  detail: (id: string) => ['product', id] as const,
  releases: (id: string) => ['product_releases', id] as const,
};

export const releaseKeys = {
  all: ['releases'] as const,
  detail: (id: string) => ['release', id] as const,
  changes: (id: string) => ['release_changes', id] as const,
  reviewers: (id: string) => ['release_reviewers', id] as const,
  comments: (id: string) => ['release_comments', id] as const,
  activity: (id: string) => ['release_activity', id] as const,
  deleted: (id: string) => ['release_deleted', id] as const,
};

export const publicReleaseKeys = {
  notes: (productId: string) => ['public-release-notes', productId] as const,
  changes: (releaseIds: string[]) => ['public-release-changes', releaseIds.join(',')] as const,
};
