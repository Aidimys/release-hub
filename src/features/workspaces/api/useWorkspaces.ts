import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { workspaceKeys } from '../../../shared/api/queryKeys';
import { supabase } from '../../../shared/api/supabase';

export const useWorkspaces = () => {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select(`
          id,
          name,
          created_at,
          workspace_members!inner (user_id, role)`)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 60_000,
  });
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, defaultProduct }: { name: string; defaultProduct?: string }) => {
      const { data, error } = await supabase.rpc('create_workspace_with_defaults', {
        workspace_name: name,
        default_product_name: defaultProduct || 'Main Product',
      });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
};

export const useUpdateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase.rpc('rename_workspace', {
        workspace_id: id,
        new_name: name,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('Workspace was not updated');
      }

      return { id, name };
    },
    onSuccess: (updatedWorkspace, variables) => {
      queryClient.setQueryData(workspaceKeys.lists(), (oldData: Array<{ id: string; name: string }> | undefined) => {
        if (!oldData) return oldData;

        return oldData.map((workspace) =>
          workspace.id === variables.id ? { ...workspace, name: updatedWorkspace.name } : workspace,
        );
      });
    },
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_workspace_by_id', {
        workspace_id: id,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('Workspace was not deleted');
      }

      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData(workspaceKeys.lists(), (oldData: Array<{ id: string }> | undefined) => {
        if (!oldData) return oldData;

        return oldData.filter((workspace) => workspace.id !== deletedId);
      });
    },
  });
};
