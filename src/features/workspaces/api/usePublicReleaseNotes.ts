import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';
import { publicReleaseKeys } from '../../../shared/api/queryKeys';
import type { ReleaseChangeCategory } from '../../../features/workspaces/utils/publicReleaseNotes';

interface PublicReleaseRow {
  id: string;
  version: string;
  title: string;
  description: string | null;
  published_at: string | null;
  products: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
}

interface PublicReleaseChangeRow {
  id: string;
  release_id: string;
  category: ReleaseChangeCategory;
  title: string;
  description: string;
  position: number;
}

export const usePublicReleaseNotes = (productId: string) => {
  return useQuery({
    queryKey: publicReleaseKeys.notes(productId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('releases')
        .select(`
          id,
          version,
          title,
          description,
          published_at,
          products (
            id,
            name,
            slug
          )
        `)
        .eq('product_id', productId)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PublicReleaseRow[];
    },
    enabled: Boolean(productId),
    retry: false,
  });
};

export const usePublicReleaseChanges = (releaseIds: string[]) => {
  return useQuery({
    queryKey: publicReleaseKeys.changes(releaseIds),
    queryFn: async () => {
      if (releaseIds.length === 0) {
        return [] as PublicReleaseChangeRow[];
      }

      const { data, error } = await supabase
        .from('release_changes')
        .select('id, release_id, category, title, description, position')
        .in('release_id', releaseIds)
        .order('release_id', { ascending: true })
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as PublicReleaseChangeRow[];
    },
    enabled: releaseIds.length > 0,
    retry: false,
  });
};
