import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';

interface ReleaseChangePayload {
  releaseId: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking';
  title: string;
  description: string;
  position: number;
  createdBy?: string | null;
}

interface ReleaseChangeOrderItem {
  id: string;
  position: number;
}

interface ReleaseCommentPayload {
  releaseId: string;
  content: string;
  userId?: string | null;
}

interface ReleaseChangeRow {
  id: string;
  category: string;
  title: string;
  description: string;
  position: number;
  created_by: string | null;
  created_at: string;
  profiles?: {
    display_name?: string | null;
  } | null;
}

export const useReleaseDetails = (releaseId: string) => {
  return useQuery({
    queryKey: ['release', releaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('releases')
        .select(`
          id,
          version,
          title,
          description,
          status,
          planned_at,
          published_at,
          created_at,
          products (
            id,
            name,
            slug
          )
        `)
        .eq('id', releaseId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!releaseId,
    retry: false,
  });
};

export const useReleaseChanges = (releaseId: string) => {
  return useQuery({
    queryKey: ['release_changes', releaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('release_changes')
        .select(`
          id,
          category,
          title,
          description,
          position,
          created_by,
          created_at,
          profiles (display_name)
        `)
        .eq('release_id', releaseId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data ?? []).map((item: ReleaseChangeRow) => ({
        ...item,
        authorName: item.profiles?.display_name ?? null,
      }));
    },
    enabled: !!releaseId,
    retry: false,
  });
};

export const useReleaseReviewers = (releaseId: string) => {
  return useQuery({
    queryKey: ['release_reviewers', releaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('release_reviewers')
        .select(`
          id,
          decision,
          decided_at,
          user_id,
          profiles (display_name)
        `)
        .eq('release_id', releaseId)
        .order('decided_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!releaseId,
    retry: false,
  });
};

export const useReleaseComments = (releaseId: string) => {
  return useQuery({
    queryKey: ['release_comments', releaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles (display_name)
        `)
        .eq('release_id', releaseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!releaseId,
    retry: false,
  });
};

export const useReleaseActivity = (releaseId: string) => {
  return useQuery({
    queryKey: ['release_activity', releaseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_events')
        .select(`
          id,
          created_at,
          event_type,
          payload,
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
        .eq('release_id', releaseId)
        .eq('event_type', 'status_changed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!releaseId,
    retry: false,
  });
};

export const useCreateReleaseChange = (releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      releaseId: targetReleaseId,
      category,
      title,
      description,
      position,
      createdBy,
    }: ReleaseChangePayload) => {
      const { data, error } = await supabase
        .from('release_changes')
        .insert({
          release_id: targetReleaseId,
          category,
          title,
          description,
          position,
          created_by: createdBy ?? null,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release_changes', releaseId] });
    },
  });
};

export const useCreateReleaseComment = (releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId: targetReleaseId, content, userId }: ReleaseCommentPayload) => {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          release_id: targetReleaseId,
          content,
          user_id: userId ?? '',
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release_comments', releaseId] });
      queryClient.invalidateQueries({ queryKey: ['release_activity', releaseId] });
      queryClient.invalidateQueries({ queryKey: ['release', releaseId] });
    },
  });
};

export const useReorderReleaseChanges = (releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: ReleaseChangeOrderItem[]) => {
      const updates = items.map((item) =>
        supabase.from('release_changes').update({ position: item.position }).eq('id', item.id)
      );

      const results = await Promise.all(updates);
      const firstError = results.find((result) => result.error);
      if (firstError?.error) {
        throw new Error(firstError.error.message);
      }

      return items;
    },
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: ['release_changes', releaseId] });

      const previousChanges = queryClient.getQueryData<Array<{ id: string; position: number; [key: string]: unknown }>>([
        'release_changes',
        releaseId,
      ]);

      const nextChanges = (previousChanges ?? []).map((change) => {
        const updatedItem = items.find((item) => item.id === change.id);
        return updatedItem ? { ...change, position: updatedItem.position } : change;
      }).sort((a, b) => a.position - b.position);

      queryClient.setQueryData(['release_changes', releaseId], nextChanges);

      return { previousChanges };
    },
    onError: (_error, _items, context) => {
      if (context?.previousChanges) {
        queryClient.setQueryData(['release_changes', releaseId], context.previousChanges);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['release_changes', releaseId] });
    },
  });
};
