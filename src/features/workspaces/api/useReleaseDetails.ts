import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';
import type { Json } from '../../../shared/api/database.types';

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
          updated_at,
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
          profiles (display_name, avatar_url)
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
          profiles!activity_events_actor_id_fkey (display_name)
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
    mutationFn: async ({ items, expectedUpdatedAt }: { items: ReleaseChangeOrderItem[]; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('reorder_release_changes', {
        p_release_id: releaseId,
        p_items: items as unknown as Json,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onMutate: async ({ items }: { items: ReleaseChangeOrderItem[]; expectedUpdatedAt?: string | null }) => {
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
    onError: (_error, _variables, context) => {
      if (context?.previousChanges) {
        queryClient.setQueryData(['release_changes', releaseId], context.previousChanges);
      }
    },
  });
};

export const useSubmitReleaseForReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, reviewerIds, expectedUpdatedAt }: { releaseId: string; reviewerIds: string[]; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('submit_release_for_review', {
        p_release_id: releaseId,
        p_reviewer_ids: reviewerIds,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release'] });
      queryClient.invalidateQueries({ queryKey: ['release_reviewers'] });
      queryClient.invalidateQueries({ queryKey: ['release_changes'] });
      queryClient.invalidateQueries({ queryKey: ['release_activity'] });
    },
  });
};

export const useCastReleaseVote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, decision, expectedUpdatedAt }: { releaseId: string; decision: 'approved' | 'rejected'; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('cast_release_vote', {
        p_release_id: releaseId,
        p_decision: decision,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release'] });
      queryClient.invalidateQueries({ queryKey: ['release_reviewers'] });
      queryClient.invalidateQueries({ queryKey: ['release_activity'] });
    },
  });
};

export const usePublishRelease = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, expectedUpdatedAt }: { releaseId: string; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('publish_release', {
        p_release_id: releaseId,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release'] });
      queryClient.invalidateQueries({ queryKey: ['release_changes'] });
      queryClient.invalidateQueries({ queryKey: ['workspace_releases'] });
      queryClient.invalidateQueries({ queryKey: ['product_releases'] });
    },
  });
};

export const useReturnRejectedReleaseToDraft = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ releaseId, expectedUpdatedAt }: { releaseId: string; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('return_rejected_release_to_draft', {
        p_release_id: releaseId,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release'] });
      queryClient.invalidateQueries({ queryKey: ['release_reviewers'] });
    },
  });
};

export const useUpdateReleaseChange = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ changeId, category, title, description, expectedUpdatedAt }: { changeId: string; category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking'; title: string; description: string; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('update_release_change', {
        p_change_id: changeId,
        p_category: category,
        p_title: title,
        p_description: description,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release_changes'] });
      queryClient.invalidateQueries({ queryKey: ['release'] });
    },
  });
};

export const useUpdateReleaseComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, content, expectedUpdatedAt }: { commentId: string; content: string; expectedUpdatedAt?: string | null }) => {
      const { data, error } = await supabase.rpc('update_release_comment', {
        p_comment_id: commentId,
        p_content: content,
        p_expected_updated_at: expectedUpdatedAt ?? undefined,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release_comments'] });
      queryClient.invalidateQueries({ queryKey: ['release_activity'] });
      queryClient.invalidateQueries({ queryKey: ['release'] });
    },
  });
};
