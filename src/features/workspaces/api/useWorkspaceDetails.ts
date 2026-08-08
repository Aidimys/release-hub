import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';
import { workspaceKeys, productKeys, releaseKeys } from '../../../shared/api/queryKeys';
import type { Database } from '../../../shared/api/database.types';

type WorkspaceMemberRow = Database['public']['Tables']['workspace_members']['Row'];
type WorkspaceInviteRow = Database['public']['Tables']['workspace_invites']['Row'];

interface WorkspaceMember extends WorkspaceMemberRow {
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  };
}

interface WorkspaceInvite extends WorkspaceInviteRow {
  profiles?: {
    display_name?: string | null;
    avatar_url?: string | null;
  };
}

// 1. Получение пространства
export const useWorkspace = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
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
export type { WorkspaceMember, WorkspaceInvite };

// 2. Получение участников
export const useWorkspaceMembers = (workspaceId: string) => {
  return useQuery<WorkspaceMember[]>({
    queryKey: workspaceKeys.members(workspaceId),
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
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });
};

// 2b. Получение приглашений
export const useWorkspaceInvites = (workspaceId: string) => {
  return useQuery<WorkspaceInvite[]>({
    queryKey: workspaceKeys.invites(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_invites')
        .select(`
          id,
          workspace_id,
          email,
          role,
          status,
          expires_at,
          accepted_at,
          created_at,
          updated_at
         `)
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkspaceInvite[];
    },
    enabled: !!workspaceId,
    retry: false,
  });
};

// 3. Получение продуктов
export const useProducts = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.products(workspaceId),
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
    queryKey: productKeys.detail(productId),
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
    queryKey: productKeys.releases(productId),
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
    queryKey: workspaceKeys.releases(workspaceId),
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
    queryKey: workspaceKeys.activity(workspaceId),
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

// 8a. Обновление продукта
export const useUpdateProduct = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, name, slug, description }: { productId: string; name: string; slug: string; description?: string | null }) => {
      const { data, error } = await supabase
        .from('products')
        .update({ name, slug, description })
        .eq('id', productId)
        .eq('workspace_id', workspaceId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.products(workspaceId) });
      queryClient.invalidateQueries({ queryKey: productKeys.detail(variables.productId) });
    },
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
    onSuccess: (_data, productId) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.products(workspaceId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
      queryClient.invalidateQueries({ queryKey: productKeys.releases(productId) });
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
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
      await queryClient.cancelQueries({ queryKey: workspaceKeys.releases(workspaceId) });
      await queryClient.cancelQueries({ queryKey: productKeys.all });

      const previousWorkspaceReleases = queryClient.getQueryData<Array<{ id?: string | null }>>(workspaceKeys.releases(workspaceId));
      const previousProductReleases = queryClient.getQueriesData({ queryKey: productKeys.all });

      queryClient.setQueryData(workspaceKeys.releases(workspaceId), (current: Array<{ id?: string | null }> | undefined) => {
        if (!current) return current;
        return current.filter((item) => item.id !== releaseId);
      });

      queryClient.setQueriesData({ queryKey: productKeys.all }, (current: Array<{ id?: string | null }> | undefined) => {
        if (!current) return current;
        return current.filter((item) => item.id !== releaseId);
      });

      return { previousWorkspaceReleases, previousProductReleases };
    },
    onError: (_error, _releaseId, context) => {
      if (context?.previousWorkspaceReleases) {
        queryClient.setQueryData(workspaceKeys.releases(workspaceId), context.previousWorkspaceReleases);
      }
      if (context?.previousProductReleases) {
        context.previousProductReleases.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(variables) });
    },
  });
};

// 10. Создание приглашения (owner only)
export const useCreateInvite = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Database['public']['Enums']['workspace_role'] }) => {
      const { data, error } = await supabase.rpc('create_invite', {
        p_workspace_id: workspaceId,
        p_email: email,
        p_role: role,
      });

      if (error) throw new Error(error.message);

      if (data === null) {
        throw new Error('Не удалось создать приглашение. Проверьте правила RLS.');
      }

      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.invites(workspaceId) });
    },
  });
};

// 11. Принятие приглашения (токен из email/URL)
export const useAcceptInvite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('accept_invite', {
        p_token: token,
      });

      if (error) throw new Error(error.message);

      if (data === null) {
        throw new Error('Не удалось принять приглашение. Проверьте правила RLS.');
      }

      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
};

// 12. Отзыв приглашения (owner only)
export const useRevokeInvite = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc('revoke_invite', {
        p_invite_id: inviteId,
      });

      if (error) throw new Error(error.message);

      if (data === null) {
        throw new Error('Не удалось отозвать приглашение. Проверьте правила RLS.');
      }

      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.invites(workspaceId) });
    },
  });
};

// 13. Повторная отправка приглашения (owner only, new token)
export const useResendInvite = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { data, error } = await supabase.rpc('resend_invite', {
        p_invite_id: inviteId,
      });

      if (error) throw new Error(error.message);

      if (data === null) {
        throw new Error('Не удалось повторно отправить приглашение. Проверьте правила RLS.');
      }

      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.invites(workspaceId) });
    },
  });
};

// 9. Отмена опубликованного релиза
export const useCancelPublishedRelease = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, expectedUpdatedAt }: { releaseId: string; expectedUpdatedAt?: string | null; productId?: string }) => {
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
    onSuccess: (_data, { releaseId, productId }) => {
      queryClient.setQueryData(releaseKeys.reviewers(releaseId), (current: Array<{ decision?: string | null; decided_at?: string | null }> | undefined) => {
        if (!current) return current;
        return current.map((reviewer) => ({
          ...reviewer,
          decision: null,
          decided_at: null,
        }));
      });
      queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(releaseId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.releases(workspaceId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
      if (productId) {
        queryClient.invalidateQueries({ queryKey: productKeys.releases(productId) });
      }
    },
  });
};

export const useChangeMemberRole = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberUserId, nextRole }: { memberUserId: string; nextRole: Database['public']['Enums']['workspace_role'] }) => {
      const { data, error } = await supabase.rpc('change_member_role', {
        p_workspace_id: workspaceId,
        p_target_user_id: memberUserId,
        p_new_role: nextRole,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, { memberUserId, nextRole }) => {
      queryClient.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (current) => {
        if (!current) return current;
        return current.map((m) => (m.user_id === memberUserId ? { ...m, role: nextRole } : m));
      });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
    },
  });
};

export const useRemoveMember = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberUserId: string) => {
      const { data, error } = await supabase.rpc('remove_member', {
        p_workspace_id: workspaceId,
        p_target_user_id: memberUserId,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_data, memberUserId) => {
      queryClient.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (current) => {
        if (!current) return current;
        return current.filter((m) => m.user_id !== memberUserId);
      });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.members(workspaceId) });
    },
  });
};