import type { Database } from '../../../shared/api/database.types';

export type ReleaseChangeRow = Database['public']['Tables']['release_changes']['Row'] & {
  profiles?: {
    display_name?: string | null;
  } | null;
};

export interface ReleaseChangeModel extends Omit<ReleaseChangeRow, 'profiles'> {
  authorName: string | null;
}

export const mapReleaseChangeRowToModel = (item: ReleaseChangeRow): ReleaseChangeModel => ({
  ...item,
  authorName: item.profiles?.display_name ?? null,
});
