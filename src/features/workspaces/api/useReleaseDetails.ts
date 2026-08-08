import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';
import { realtimeDedup } from '../../../shared/api/realtimeDedup';
import { releaseKeys } from '../../../shared/api/queryKeys';
import { mapReleaseChangeRowToModel } from './releaseChangeMapper';
import type { Json } from '../../../shared/api/database.types';

import type { Database } from '../../../shared/api/database.types';

interface ReleaseChangePayload {
  releaseId: string;
  category: Database['public']['Enums']['change_category'];
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

export const useReleaseDetails = (releaseId: string) => {
  return useQuery({
    queryKey: releaseKeys.detail(releaseId),
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
    queryKey: releaseKeys.changes(releaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('release_changes')
        .select(`
          id,
          release_id,
          category,
          title,
          description,
          position,
          created_by,
          created_at,
          updated_at,
          profiles (display_name)
        `)
        .eq('release_id', releaseId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data ?? []).map(mapReleaseChangeRowToModel);
    },
    enabled: !!releaseId,
    retry: false,
  });
};

export const useReleaseReviewers = (releaseId: string) => {
  return useQuery({
    queryKey: releaseKeys.reviewers(releaseId),
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
    queryKey: releaseKeys.comments(releaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          created_at,
          updated_at,
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
    queryKey: releaseKeys.activity(releaseId),
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
      queryClient.invalidateQueries({ queryKey: releaseKeys.changes(releaseId) });
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
      queryClient.invalidateQueries({ queryKey: releaseKeys.comments(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
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
      await queryClient.cancelQueries({ queryKey: releaseKeys.changes(releaseId) });

      const previousChanges = queryClient.getQueryData<Array<{ id: string; position: number; [key: string]: unknown }>>(
        releaseKeys.changes(releaseId),
      );

      const nextChanges = (previousChanges ?? []).map((change) => {
        const updatedItem = items.find((item) => item.id === change.id);
        return updatedItem ? { ...change, position: updatedItem.position } : change;
      }).sort((a, b) => a.position - b.position);

      items.forEach((item) => {
        realtimeDedup.markOwn('release_changes', item.id, item.position);
      });

      queryClient.setQueryData(releaseKeys.changes(releaseId), nextChanges);

      return { previousChanges };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousChanges) {
        queryClient.setQueryData(releaseKeys.changes(releaseId), context.previousChanges);
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
    onSuccess: (_data, { releaseId }) => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.changes(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
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
    onSuccess: (_data, { releaseId }) => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
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
    onSuccess: (_data, { releaseId }) => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.changes(releaseId) });
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
    onSuccess: (_data, { releaseId }) => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.reviewers(releaseId) });
    },
  });
};

export const useUpdateReleaseChange = (releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ changeId, category, title, description, expectedUpdatedAt }: { changeId: string; category: Database['public']['Enums']['change_category']; title: string; description: string; expectedUpdatedAt?: string | null }) => {
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
      queryClient.invalidateQueries({ queryKey: releaseKeys.changes(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
    },
  });
};

export const useCreateActivityEvent = (workspaceId: string, releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventType, payload, actorId }: { eventType: string; payload: Json | undefined; actorId: string }) => {
      const { data, error } = await supabase
        .from('activity_events')
        .insert({
          workspace_id: workspaceId,
          release_id: releaseId,
          actor_id: actorId,
          event_type: eventType,
          payload,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
    },
  });
};

export const useDeleteReleaseComment = (releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw new Error(error.message);
      return commentId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.comments(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
    },
  });
};

export const useDeleteReleaseChange = (releaseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (changeId: string) => {
      const { error } = await supabase
        .from('release_changes')
        .delete()
        .eq('id', changeId);

      if (error) throw new Error(error.message);
      return changeId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: releaseKeys.changes(releaseId) });
    },
  });
};

export const useUpdateReleaseComment = (releaseId: string) => {
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
      queryClient.invalidateQueries({ queryKey: releaseKeys.comments(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.activity(releaseId) });
      queryClient.invalidateQueries({ queryKey: releaseKeys.detail(releaseId) });
    },
  });
};
