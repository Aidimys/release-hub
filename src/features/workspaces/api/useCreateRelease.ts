import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';

import type { Database } from '../../../shared/api/database.types';

interface CreateReleasePayload {
  productId: string;
  version: string;
  title: string;
  description?: string;
  status?: Database['public']['Enums']['release_status'];
  plannedAt?: string | null;
  createdBy?: string | null;
}

export const useCreateRelease = (productId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId: targetProductId,
      version,
      title,
      description,
      status = 'draft',
      plannedAt,
      createdBy,
    }: CreateReleasePayload) => {
      const { data, error } = await supabase
        .from('releases')
        .insert({
          product_id: targetProductId,
          version,
          title,
          description: description?.trim() || null,
          status,
          planned_at: plannedAt ? new Date(plannedAt).toISOString() : null,
          created_by: createdBy ?? null,
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product_releases', productId] });
      queryClient.invalidateQueries({ queryKey: ['releases'] });
    },
  });
};
