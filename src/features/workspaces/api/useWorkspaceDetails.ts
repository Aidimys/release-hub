import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';

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

// 2. Получение участников
export const useWorkspaceMembers = (workspaceId: string) => {
  return useQuery({
    queryKey: ['workspace_members', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_members')
        .select(`
          user_id,
          role,
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
        return fallback;
      }

      return data;
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