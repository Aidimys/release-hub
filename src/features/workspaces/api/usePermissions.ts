import { useMemo } from 'react';
import { useAuth } from '../../../app/providers/AuthProvider';
import type { Enums } from '../../../shared/api/database.types';

type WorkspaceRole = Enums<'workspace_role'>;

interface UsePermissionsReturn {
  role: WorkspaceRole;
  canEditWorkspace: boolean;
  canManageMembers: boolean;
  canAssignRoles: boolean;
  canCreateProduct: boolean;
  canDeleteProduct: boolean;
  canCreateRelease: boolean;
  canDeleteRelease: boolean;
  canCancelPublishedRelease: boolean;
  canEditRelease: boolean;
  canSendForReview: boolean;
  canApproveRelease: boolean;
  canRejectRelease: boolean;
  canPublishRelease: boolean;
  canAddChange: boolean;
  canEditChange: boolean;
  canDeleteOwnChange: boolean;
  canAddComment: boolean;
  canEditComment: boolean;
  canDeleteOwnComment: boolean;
}

export const usePermissions = (members?: Array<{ user_id: string | null; role: string }>): UsePermissionsReturn => {
  const { user } = useAuth();

  const role = useMemo<WorkspaceRole>(() => {
    if (!user?.id || !members) return 'contributor';
    const member = members.find((m) => m.user_id === user.id);
    return (member?.role as WorkspaceRole) || 'contributor';
  }, [user?.id, members]);

  return useMemo<UsePermissionsReturn>(() => {
    const isOwner = role === 'owner';
    const isMaintainer = role === 'maintainer';
    const isContributor = role === 'contributor';

    return {
      role,
      canEditWorkspace: isOwner,
      canManageMembers: isOwner,
      canAssignRoles: isOwner,
      canCreateProduct: isOwner,
      canDeleteProduct: isOwner,
      canCreateRelease: isOwner || isMaintainer,
      canDeleteRelease: isOwner,
      canCancelPublishedRelease: isOwner,
      canEditRelease: isOwner || isMaintainer,
      canSendForReview: isOwner || isMaintainer,
      canApproveRelease: isOwner || isMaintainer,
      canRejectRelease: isOwner || isMaintainer,
      canPublishRelease: isOwner || isMaintainer,
      canAddChange: isOwner || isMaintainer || isContributor,
      canEditChange: isOwner || isMaintainer || isContributor,
      canDeleteOwnChange: isContributor,
      canAddComment: isOwner || isMaintainer || isContributor,
      canEditComment: isOwner || isMaintainer || isContributor,
      canDeleteOwnComment: isContributor,
    };
  }, [role]);
};