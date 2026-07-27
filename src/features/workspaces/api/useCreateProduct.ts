import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../../shared/api/supabase";

export interface CreateProductPayload {
  name: string;
  slug: string;
}

export const useCreateProduct = (workspaceId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ name, slug }: CreateProductPayload) => {
            const { data, error } = await supabase
            .from('products')
            .insert({
                workspace_id: workspaceId,
                name,
                slug,
            })
            .select()
            .single();
            if (error) {
                throw new Error(error.message);
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products', workspaceId] });
        },
    });
};