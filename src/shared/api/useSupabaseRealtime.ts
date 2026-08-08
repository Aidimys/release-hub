import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { realtimeDedup } from './realtimeDedup';
import { workspaceKeys, productKeys, releaseKeys } from './queryKeys';
import type { ReleaseStatus } from '../../features/workspaces/utils/releaseWorkflow';

interface RealtimePayload {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}

interface QueryListItem {
  id?: string | null;
  [key: string]: unknown;
}

interface ReleaseRecord {
  id?: string;
  status?: ReleaseStatus | null;
  published_at?: string | null;
  [key: string]: unknown;
}

const tableLabels: Record<string, string> = {
  workspaces: 'рабочих пространств',
  workspace_members: 'участников',
  workspace_invites: 'приглашений',
};

const invalidateQueryByTable = (queryClient: ReturnType<typeof useQueryClient>, table: string) => {
  switch (table) {
    case 'workspaces':
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      break;
    case 'workspace_members':
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      break;
    case 'workspace_invites':
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      break;
    default:
      return;
  }
};

const watchedTables = ['workspaces', 'workspace_members', 'workspace_invites'] as const;

const applyListChange = (queryClient: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[], payload: RealtimePayload) => {
  queryClient.setQueryData(queryKey, (current: QueryListItem[] | undefined) => {
    if (!current) return current;

    const incoming = payload.new ?? payload.old;
    const id = typeof incoming?.id === 'string' ? incoming.id : undefined;

    if (!id) return current;

    if (payload.eventType === 'DELETE') {
      const oldId = typeof payload.old?.id === 'string' ? payload.old.id : undefined;
      return current.filter((item) => item.id !== oldId);
    }

    const nextItem = incoming as QueryListItem | null;
    if (!nextItem) return current;

    const existingIndex = current.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      const updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], ...nextItem };
      return updated;
    }

    return [nextItem, ...current];
  });
};

const removeItemFromAllMatchingQueries = (queryClient: ReturnType<typeof useQueryClient>, queryKeyPrefix: readonly unknown[], releaseId: string) => {
  queryClient.setQueriesData({ queryKey: queryKeyPrefix }, (current: QueryListItem[] | undefined) => {
    if (!current) return current;
    return current.filter((item) => item.id !== releaseId);
  });
};

export const useAppRealtime = (onUpdate?: (message: string) => void) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel('app-realtime');

    watchedTables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          invalidateQueryByTable(queryClient, table);
          if (onUpdate) {
            onUpdate(`Данные ${tableLabels[table] ?? 'обновлены'}`);
          }
        }
      );
    });

    const subscribe = async () => {
      await channel.subscribe();
    };

    subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, onUpdate]);
};

export const useWorkspaceRealtime = (workspaceId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase.channel(`workspace-${workspaceId}`);

    const isReleaseInWorkspace = (payload: { new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      const incoming = payload.new ?? payload.old;
      const productId = typeof incoming?.product_id === 'string' ? incoming.product_id : undefined;
      if (!productId) return false;

      const products = queryClient.getQueryData<Array<{ id?: unknown }>>(workspaceKeys.products(workspaceId));
      if (!Array.isArray(products)) return true;
      return products.some((product) => product.id === productId);
    };

    const updateWorkspaceReleasesCache = (payload: { eventType?: string; new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
      applyListChange(queryClient, workspaceKeys.releases(workspaceId), payload as RealtimePayload);

      if (payload.eventType === 'DELETE') {
        const productId = typeof payload.old?.product_id === 'string' ? payload.old.product_id : undefined;
        if (productId) {
          applyListChange(queryClient, productKeys.releases(productId), payload as RealtimePayload);
        }
      }
    };

    const subscribe = async () => {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'workspace_members', filter: `workspace_id=eq.${workspaceId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
            queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
            queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'workspace_invites', filter: `workspace_id=eq.${workspaceId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: workspaceKeys.invites(workspaceId) });
            queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products', filter: `workspace_id=eq.${workspaceId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: workspaceKeys.products(workspaceId) });
            queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'releases' },
          (payload) => {
            const releasePayload = payload as { eventType?: string; new?: Record<string, unknown> | null; old?: Record<string, unknown> | null };
            if (!isReleaseInWorkspace(releasePayload)) return;
            updateWorkspaceReleasesCache(releasePayload);
            queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
          }
        );

      await channel.subscribe();
    };

    subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, workspaceId]);
};

export const useReleaseRealtime = (releaseId: string, workspaceId?: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!releaseId) return;

    const channel = supabase.channel(`release-${releaseId}`);

    const applyListChangeForRelease = (queryKey: readonly unknown[], payload: RealtimePayload) => {
      applyListChange(queryClient, queryKey, payload);
    };

    const subscribe = async () => {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'releases', filter: `id=eq.${releaseId}` },
          (payload: RealtimePayload) => {
            if (payload.eventType === 'DELETE') {
              queryClient.setQueryData(releaseKeys.detail(releaseId), null);
              queryClient.setQueryData(releaseKeys.deleted(releaseId), true);
              if (workspaceId) {
                removeItemFromAllMatchingQueries(queryClient, workspaceKeys.releases(workspaceId), releaseId);
                queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
              }
              const productId = typeof payload.old?.product_id === 'string' ? payload.old.product_id : undefined;
              if (productId) {
                removeItemFromAllMatchingQueries(queryClient, productKeys.releases(productId), releaseId);
                queryClient.invalidateQueries({ queryKey: productKeys.releases(productId) });
              }
              return;
            }

            const nextStatus = typeof payload.new?.status === 'string' ? payload.new.status : undefined;
            if (nextStatus && realtimeDedup.consumeIfOwn('releases', releaseId, nextStatus)) return;

            queryClient.setQueryData(releaseKeys.deleted(releaseId), false);
            queryClient.setQueryData(releaseKeys.detail(releaseId), (current: ReleaseRecord | undefined) => {
              if (!current) return payload.new ? (payload.new as ReleaseRecord) : current;
              return { ...current, ...(payload.new ? (payload.new as ReleaseRecord) : {}) };
            });
            queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
            if (workspaceId) {
              queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'release_changes', filter: `release_id=eq.${releaseId}` },
          (payload: RealtimePayload) => {
            const incoming = payload.new ?? payload.old;
            if (typeof incoming?.position === 'number' && incoming.position < 0) return;
            const changeId = typeof incoming?.id === 'string' ? incoming.id : undefined;
            const position = typeof incoming?.position === 'number' ? incoming.position : undefined;
            if (changeId && position !== undefined && realtimeDedup.consumeIfOwn('release_changes', changeId, position)) return;
            applyListChangeForRelease(releaseKeys.changes(releaseId), payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'comments', filter: `release_id=eq.${releaseId}` },
          (payload: RealtimePayload) => {
            applyListChangeForRelease(releaseKeys.comments(releaseId), payload);
            queryClient.invalidateQueries({ queryKey: releaseKeys.comments(releaseId) });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'release_reviewers', filter: `release_id=eq.${releaseId}` },
          (payload: RealtimePayload) => {
            applyListChangeForRelease(releaseKeys.reviewers(releaseId), payload);
            queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(releaseId) });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'activity_events', filter: `release_id=eq.${releaseId}` },
          (payload: RealtimePayload) => {
            applyListChangeForRelease(releaseKeys.activity(releaseId), payload);
            queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
          }
        );

      await channel.subscribe();
    };

    subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, releaseId, workspaceId]);
};

export const useProductReleasesRealtime = (productId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!productId) return;

    const channel = supabase.channel(`product-releases-${productId}`);

    const subscribe = async () => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'releases', filter: `product_id=eq.${productId}` },
        (payload) => {
          applyListChange(queryClient, productKeys.releases(productId), payload as RealtimePayload);
          queryClient.invalidateQueries({ queryKey: productKeys.releases(productId) });
        }
      );

      await channel.subscribe();
    };

    subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, productId]);
};
