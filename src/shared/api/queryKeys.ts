export const workspaceKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspaceKeys.all, 'list'] as const,
  detail: (id: string) => [...workspaceKeys.all, 'detail', id] as const,
  members: (id: string) => [...workspaceKeys.detail(id), 'members'] as const,
};

export const releaseKeys = {
  all: ['releases'] as const,
  list: (workspaceId: string, filters?: Record<string, string>) =>
    [...releaseKeys.all, 'list', workspaceId, filters] as const,
  detail: (id: string) => [...releaseKeys.all, 'detail', id] as const,
  changes: (id: string) => [...releaseKeys.detail(id), 'changes'] as const,
  comments: (id: string) => [...releaseKeys.detail(id), 'comments'] as const,
  activity: (id: string) => [...releaseKeys.detail(id), 'activity'] as const,
};