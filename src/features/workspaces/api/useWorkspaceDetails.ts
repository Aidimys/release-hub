import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';
import type { Database } from '../../../shared/api/database.types';

type WorkspaceMemberRow = Database['public']['Tables']['workspace_members']['Row'];

interface WorkspaceMember extends WorkspaceMemberRow {
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  };
}

// 1. Получение пространства
export const useWorkspace = (workspaceId: string) => {
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, created_at, created_by')
        .eq('id', workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
    retry: false,
  });
};
export type { WorkspaceMember };

// 2. Получение участников
export const useWorkspaceMembers = (workspaceId: string) => {
  return useQuery<WorkspaceMember[]>({
    queryKey: ['workspace_members', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          user_id,
          role,
          invited_email,
          status,
          profiles (
            display_name,
            avatar_url
          )
        `)
        .eq('workspace_id', workspaceId);

      if (error) {
        const { data: fallback, error: fallbackError } = await supabase
          .from('workspace_members')
          .select('user_id, role')
          .eq('workspace_id', workspaceId);

        if (fallbackError) throw fallbackError;
        return fallback as WorkspaceMember[];
      }

      return data as WorkspaceMember[];
    },
    enabled: !!workspaceId,
    retry: false,
  });
};

// 3. Получение продуктов
export const useProducts = (workspaceId: string) => {
  return useQuery({
    queryKey: ['products', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
    retry: false,
  });
};

// 4. Получение одного продукта
export const useProductDetails = (productId: string) => {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!productId,
    retry: false,
  });
};

// 5. Получение релизов продукта
export const useProductReleases = (productId: string) => {
  return useQuery({
    queryKey: ['product_releases', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('releases')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!productId,
    retry: false,
  });
};

// 6. Получение релизов рабочего пространства
export const useWorkspaceReleases = (workspaceId: string) => {
  return useQuery({
    queryKey: ['workspace_releases', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('releases')
        .select(`
          id,
          product_id,
          version,
          title,
          status,
          planned_at,
          created_at,
          published_at,
          products!inner (
            id,
            name,
            workspace_id
          )
        `)
        .eq('products.workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
    retry: false,
  });
};

// 7. Получение журнала активности рабочего пространства
export const useWorkspaceActivity = (workspaceId: string) => {
  return useQuery({
    queryKey: ['workspace_activity', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select(`
          id,
          created_at,
          event_type,
          payload,
          release_id,
          actor_id,
          profiles!activity_events_actor_id_fkey (display_name),
          releases!activity_events_release_id_fkey (
            id,
            title,
            version,
            product_id,
            products (id, name)
          )
        `)
        .eq('workspace_id', workspaceId)
        .eq('event_type', 'status_changed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
    retry: false,
  });
};

// 8. Удаление продукта
export const useDeleteProduct = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)
        .eq('workspace_id', workspaceId);

      if (error) throw new Error(error.message);
      return productId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspace_releases', workspaceId] });
    },
  });
};

// 8. Удаление релиза
export const useDeleteRelease = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (releaseId: string) => {
      const { error } = await supabase
        .from('releases')
        .delete()
        .eq('id', releaseId);

      if (error) throw new Error(error.message);
      return releaseId;
    },
    onMutate: async (releaseId: string) => {
      await queryClient.cancelQueries({ queryKey: ['workspace_releases', workspaceId] });
      await queryClient.cancelQueries({ queryKey: ['product_releases'] });

      const previousWorkspaceReleases = queryClient.getQueryData<Array<{ id?: string | null }>>(['workspace_releases', workspaceId]);
      const previousProductReleases = queryClient.getQueriesData({ queryKey: ['product_releases'] });

      queryClient.setQueryData(['workspace_releases', workspaceId], (current: Array<{ id?: string | null }> | undefined) => {
        if (!current) return current;
        return current.filter((item) => item.id !== releaseId);
      });

      queryClient.setQueriesData({ queryKey: ['product_releases'] }, (current: Array<{ id?: string | null }> | undefined) => {
        if (!current) return current;
        return current.filter((item) => item.id !== releaseId);
      });

      return { previousWorkspaceReleases, previousProductReleases };
    },
    onError: (_error, _releaseId, context) => {
      if (context?.previousWorkspaceReleases) {
        queryClient.setQueryData(['workspace_releases', workspaceId], context.previousWorkspaceReleases);
      }
      if (context?.previousProductReleases) {
        context.previousProductReleases.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace_releases', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['product_releases'] });
      queryClient.invalidateQueries({ queryKey: ['release'] });
    },
  });
};

// 9. Отмена опубликованного релиза
export const useCancelPublishedRelease = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, expectedUpdatedAt }: { releaseId: string; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('cancel_published_release', {
        p_release_id: releaseId,
        p_expected_updated_at: expectedUpdatedAt ?? null,
      });

      if (error) throw new Error(error.message);

      await supabase
        .from('release_reviewers')
        .update({ decision: null, decided_at: null })
        .eq('release_id', releaseId);

      return data;
    },
    onSuccess: (_data, { releaseId }) => {
      queryClient.setQueryData(['release_reviewers', releaseId], (current: Array<{ decision?: string | null; decided_at?: string | null }> | undefined) => {
        if (!current) return current;
        return current.map((reviewer) => ({
          ...reviewer,
          decision: null,
          decided_at: null,
        }));
      });
      queryClient.invalidateQueries({ queryKey: ['release_reviewers', releaseId] });
      queryClient.invalidateQueries({ queryKey: ['workspace_releases', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['product_releases'] });
      queryClient.invalidateQueries({ queryKey: ['release'] });
    },
  });
};