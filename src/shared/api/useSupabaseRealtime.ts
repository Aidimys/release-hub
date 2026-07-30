import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

const tableLabels: Record<string, string> = {
  workspaces: 'рабочих пространств',
  workspace_members: 'участников',
};

const invalidateQueryByTable = (queryClient: ReturnType<typeof useQueryClient>, table: string) => {
  switch (table) {
    case 'workspaces':
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      break;
    case 'workspace_members':
      queryClient.invalidateQueries({ queryKey: ['workspace_members'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      break;
    default:
      queryClient.invalidateQueries();
      break;
  }
};

const watchedTables = ['workspaces', 'workspace_members'] as const;

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

    const subscribe = async () => {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'workspace_members', filter: `workspace_id=eq.${workspaceId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['workspace_members', workspaceId] });
            queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
            queryClient.invalidateQueries({ queryKey: ['workspaces'] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products', filter: `workspace_id=eq.${workspaceId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['products', workspaceId] });
            queryClient.invalidateQueries({ queryKey: ['workspace_releases', workspaceId] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'releases' },
          () => {
            queryClient.invalidateQueries({ queryKey: ['workspace_releases', workspaceId] });
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

    const subscribe = async () => {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'releases', filter: `id=eq.${releaseId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['release', releaseId] });
            if (workspaceId) {
              queryClient.invalidateQueries({ queryKey: ['workspace_releases', workspaceId] });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'release_changes', filter: `release_id=eq.${releaseId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['release_changes', releaseId] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'comments', filter: `release_id=eq.${releaseId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['release_comments', releaseId] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'release_reviewers', filter: `release_id=eq.${releaseId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['release_reviewers', releaseId] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'activity_events', filter: `release_id=eq.${releaseId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['release_activity', releaseId] });
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
        () => {
          queryClient.invalidateQueries({ queryKey: ['product_releases', productId] });
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
