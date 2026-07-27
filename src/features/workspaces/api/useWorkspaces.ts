import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { workspaceKeys } from "../../../shared/api/queryKeys"
import { supabase } from "../../../shared/api/supabase"

export const useWorkspaces = () => {
    return useQuery({
        queryKey: workspaceKeys.lists(),
        queryFn: async () => {
            const {data, error} = await supabase
            .from("workspaces")
            .select(`
                id,
                name,
                created_at,
                workspace_members!inner (role)`)
            .order("created_at", { ascending: false })

            if (error) {
                throw new Error(error.message)
            }
            return data
        }
        });    
};

export const useCreateWorkspace = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({name, defaultProduct}: {name: string, defaultProduct?: string}) => {
            const {data, error} = await supabase.rpc("create_workspace_with_defaults", {
                workspace_name: name,
                default_product_name: defaultProduct || 'Main Product'
            });
            if (error) {
                throw new Error(error.message)
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
        }
    });
}
