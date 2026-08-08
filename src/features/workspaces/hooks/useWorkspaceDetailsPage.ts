import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/providers/AuthProvider';
import { useWorkspace, useProducts, useWorkspaceMembers, useWorkspaceReleases, useWorkspaceActivity, useWorkspaceInvites, useCreateInvite, useRevokeInvite, useResendInvite, useDeleteProduct, useDeleteRelease, useCancelPublishedRelease, useUpdateProduct, type WorkspaceMember, type WorkspaceInvite } from '../../../features/workspaces/api/useWorkspaceDetails';
import { usePermissions } from '../../../features/workspaces/api/usePermissions';
import { useWorkspaceRealtime } from '../../../shared/api/useSupabaseRealtime';
import { supabase } from '../../../shared/api/supabase';
import type { User } from '@supabase/supabase-js';

type Tab = 'products' | 'releases' | 'members' | 'activity';

interface WorkspaceProduct {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface WorkspaceRelease {
  id: string;
  version: string;
  title: string;
  status: string;
  updated_at?: string | null;
  planned_at?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  products?: {
    id: string;
    name: string;
    workspace_id: string;
  } | null;
  [key: string]: unknown;
}

interface WorkspaceActivityItem {
  id: string;
  event_type?: string | null;
  created_at?: string | null;
  payload?: unknown;
  profiles?: {
    display_name?: string | null;
  } | null;
  releases?: {
    title?: string | null;
    version?: string | null;
    products?: {
      name?: string | null;
    } | null;
  } | null;
}

export interface UseWorkspaceDetailsPageReturn {
  workspaceId: string;
  navigate: ReturnType<typeof useNavigate>;
  user: User | null;
  isAuthLoading: boolean;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  memberEmail: string;
  setMemberEmail: (email: string) => void;
  memberRole: 'owner' | 'maintainer' | 'contributor';
  setMemberRole: (role: 'owner' | 'maintainer' | 'contributor') => void;
  memberError: string | null;
  setMemberError: (error: string | null) => void;
  memberSuccess: string | null;
  setMemberSuccess: (success: string | null) => void;
  inviteToken: string | null;
  setIsCreateModalOpen: (open: boolean) => void;
  setEditingProduct: (product: WorkspaceProduct | null) => void;
  setDeletingProduct: (product: WorkspaceProduct | null) => void;
  isCreateModalOpen: boolean;
  editingProduct: WorkspaceProduct | null;
  deletingProduct: WorkspaceProduct | null;
  workspace: ReturnType<typeof useWorkspace>['data'];
  isWsLoading: boolean;
  isWsError: boolean;
  wsError: Error | null;
  members: WorkspaceMember[] | undefined;
  invites: WorkspaceInvite[] | undefined;
  products: WorkspaceProduct[] | undefined;
  isProductsLoading: boolean;
  isProductsError: boolean;
  productsError: Error | null;
  releases: WorkspaceRelease[] | undefined;
  isReleasesLoading: boolean;
  isReleasesError: boolean;
  releasesError: Error | null;
  activity: WorkspaceActivityItem[] | undefined;
  isActivityLoading: boolean;
  deleteProduct: ReturnType<typeof useDeleteProduct>;
  deleteRelease: ReturnType<typeof useDeleteRelease>;
  cancelPublishedRelease: ReturnType<typeof useCancelPublishedRelease>;
  updateProduct: ReturnType<typeof useUpdateProduct>;
  createInvite: ReturnType<typeof useCreateInvite>;
  revokeInvite: ReturnType<typeof useRevokeInvite>;
  resendInvite: ReturnType<typeof useResendInvite>;
  permissions: ReturnType<typeof usePermissions>;
  queryClient: ReturnType<typeof useQueryClient>;
  statusFilter: string;
  searchFilter: string;
  sortOrder: string;
  page: number;
  pageSize: number;
  filteredReleases: WorkspaceRelease[];
  totalPages: number;
  safePage: number;
  pagedReleases: WorkspaceRelease[];
  updateParams: (next: Record<string, string | null>) => void;
  ownerCount: number;
  isLastOwner: boolean;
  handleInviteMember: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleMemberRoleChange: (memberUserId: string | null, nextRole: 'owner' | 'maintainer' | 'contributor') => Promise<void>;
  handleRemoveMember: (memberUserId: string | null) => Promise<void>;
  handleRevokeInvite: (inviteId: string) => Promise<void>;
  handleResendInvite: (inviteId: string) => Promise<void>;
  handleDeleteProduct: (productId: string) => Promise<void>;
  handleUpdateProduct: (productId: string, data: { name: string; slug: string; description?: string | null }) => Promise<void>;
  handleDeleteRelease: (releaseId: string) => Promise<void>;
  handleCancelPublishedRelease: (releaseId: string, updatedAt?: string | null) => Promise<void>;
}

export interface ProductsTabProps {
  products: WorkspaceProduct[] | undefined;
  isProductsLoading: boolean;
  isProductsError: boolean;
  productsError: Error | null;
  permissions: {
    canCreateProduct: boolean;
    canEditProduct: boolean;
    canDeleteProduct: boolean;
  };
  workspaceId: string;
  setIsCreateModalOpen: (open: boolean) => void;
  setEditingProduct: (product: WorkspaceProduct | null) => void;
  setDeletingProduct: (product: WorkspaceProduct | null) => void;
  deleteProduct: { isPending: boolean };
}

export interface ReleasesTabProps {
  releases: WorkspaceRelease[] | undefined;
  isReleasesLoading: boolean;
  isReleasesError: boolean;
  releasesError: Error | null;
  filteredReleases: WorkspaceRelease[];
  pagedReleases: WorkspaceRelease[];
  totalPages: number;
  safePage: number;
  statusFilter: string;
  searchFilter: string;
  sortOrder: string;
  updateParams: (next: Record<string, string | null>) => void;
  permissions: {
    canDeleteRelease: boolean;
    canCancelPublishedRelease: boolean;
  };
  workspaceId: string;
  handleDeleteRelease: (releaseId: string) => Promise<void>;
  handleCancelPublishedRelease: (releaseId: string, updatedAt?: string | null) => Promise<void>;
  deleteRelease: { isPending: boolean };
  cancelPublishedRelease: { isPending: boolean };
}

export interface MembersTabProps {
  permissions: {
    canManageMembers: boolean;
    role: string;
  };
  user: User | null;
  members: WorkspaceMember[] | undefined;
  invites: WorkspaceInvite[] | undefined;
  handleInviteMember: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleMemberRoleChange: (memberUserId: string | null, nextRole: 'owner' | 'maintainer' | 'contributor') => Promise<void>;
  handleRemoveMember: (memberUserId: string | null) => Promise<void>;
  handleRevokeInvite: (inviteId: string) => Promise<void>;
  handleResendInvite: (inviteId: string) => Promise<void>;
  createInvite: { isPending: boolean };
  revokeInvite: { isPending: boolean };
  resendInvite: { isPending: boolean };
  memberEmail: string;
  setMemberEmail: (email: string) => void;
  memberRole: 'owner' | 'maintainer' | 'contributor';
  setMemberRole: (role: 'owner' | 'maintainer' | 'contributor') => void;
  inviteToken: string | null;
  memberSuccess: string | null;
  setMemberSuccess: (success: string | null) => void;
}

export interface ActivityTabProps {
  activity: WorkspaceActivityItem[] | undefined;
  isActivityLoading: boolean;
}

export const useWorkspaceDetailsPage = (workspaceId: string): UseWorkspaceDetailsPageReturn => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'owner' | 'maintainer' | 'contributor'>('contributor');
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<WorkspaceProduct | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<WorkspaceProduct | null>(null);

  useWorkspaceRealtime(workspaceId);
  const { data: workspace, isLoading: isWsLoading, isError: isWsError, error: wsError } = useWorkspace(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { data: invites } = useWorkspaceInvites(workspaceId);
  const { data: products, isLoading: isProductsLoading, isError: isProductsError, error: productsError } = useProducts(workspaceId);
  const { data: releases, isLoading: isReleasesLoading, isError: isReleasesError, error: releasesError } = useWorkspaceReleases(workspaceId);
  const { data: activity, isLoading: isActivityLoading } = useWorkspaceActivity(workspaceId);

  const deleteProduct = useDeleteProduct(workspaceId);
  const deleteRelease = useDeleteRelease(workspaceId);
  const cancelPublishedRelease = useCancelPublishedRelease(workspaceId);
  const updateProduct = useUpdateProduct(workspaceId);
  const createInvite = useCreateInvite(workspaceId);
  const revokeInvite = useRevokeInvite(workspaceId);
  const resendInvite = useResendInvite(workspaceId);

  const permissions = usePermissions(members);
  const queryClient = useQueryClient();

  const statusFilter = searchParams.get('status') ?? 'all';
  const searchFilter = searchParams.get('search') ?? '';
  const sortOrder = searchParams.get('sort') ?? 'date-desc';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = 5;

  const filteredReleases = useMemo(() => {
    if (!releases) return [];

    const normalized = releases.filter((release: WorkspaceRelease) => {
      const matchesStatus = statusFilter === 'all' || release.status === statusFilter;
      const haystack = `${release.title} ${release.version}`.toLowerCase();
      const matchesSearch = haystack.includes(searchFilter.toLowerCase());
      return matchesStatus && matchesSearch;
    });

    const sorted = [...normalized].sort((a, b) => {
      const dateA = new Date(a.created_at ?? 0).getTime();
      const dateB = new Date(b.created_at ?? 0).getTime();
      return sortOrder === 'date-asc' ? dateA - dateB : dateB - dateA;
    });

    return sorted;
  }, [releases, searchFilter, sortOrder, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredReleases.length / pageSize));
  const safePage = Math.min(Number.isFinite(page) ? page : 1, totalPages);
  const pagedReleases = filteredReleases.slice((safePage - 1) * pageSize, safePage * pageSize);

  const updateParams = useCallback((next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(next).forEach(([key, value]) => {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    if (!params.get('page')) {
      params.set('page', '1');
    }

    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const ownerCount = useMemo(() => {
    return members?.filter((m) => m.role === 'owner').length ?? 0;
  }, [members]);

  const isLastOwner = useMemo(() => {
    if (!user?.id) return false;
    const currentMember = members?.find((m) => m.user_id === user.id);
    return currentMember?.role === 'owner' && ownerCount <= 1;
  }, [user, members, ownerCount]);

  const handleInviteMember = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberEmail.trim()) return;

    setMemberError(null);
    setMemberSuccess(null);
    setInviteToken(null);

    try {
      const token = await createInvite.mutateAsync({
        email: memberEmail.trim(),
        role: memberRole,
      });

      setMemberEmail('');
      setMemberRole('contributor');
      setMemberSuccess(`Приглашение отправлено на ${memberEmail.trim()}. Поделитесь этим токеном с пользователем.`);
      setInviteToken(token);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось пригласить участника');
    }
  }, [memberEmail, memberRole, createInvite]);

  const handleMemberRoleChange = useCallback(async (memberUserId: string | null, nextRole: 'owner' | 'maintainer' | 'contributor') => {
    if (!memberUserId) return;

    const targetMember = members?.find((member) => member.user_id === memberUserId);
    if (targetMember?.role === 'owner' && nextRole !== 'owner' && isLastOwner) {
      setMemberError('Нельзя понизить роль последнего owner');
      return;
    }

    try {
      const { error } = await supabase.rpc('change_member_role', {
        p_workspace_id: workspaceId,
        p_target_user_id: memberUserId,
        p_new_role: nextRole,
      });

      if (error) throw new Error(error.message);
      queryClient.setQueryData<WorkspaceMember[]>(['workspace_members', workspaceId], (current) => {
        if (!current) return current;
        return current.map((m) => (m.user_id === memberUserId ? { ...m, role: nextRole } : m));
      });
      await queryClient.invalidateQueries({ queryKey: ['workspace_members', workspaceId] });
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось обновить роль');
    }
  }, [members, isLastOwner, workspaceId, queryClient]);

  const handleRemoveMember = useCallback(async (memberUserId: string | null) => {
    if (!memberUserId) return;

    const targetMember = members?.find((member) => member.user_id === memberUserId);
    if (targetMember?.role === 'owner' && isLastOwner) {
      setMemberError('Нельзя удалить последнего owner');
      return;
    }

    try {
      const { error } = await supabase.rpc('remove_member', {
        p_workspace_id: workspaceId,
        p_target_user_id: memberUserId,
      });

      if (error) throw new Error(error.message);
      queryClient.setQueryData<WorkspaceMember[]>(['workspace_members', workspaceId], (current) => {
        if (!current) return current;
        return current.filter((m) => m.user_id !== memberUserId);
      });
      await queryClient.invalidateQueries({ queryKey: ['workspace_members', workspaceId] });
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить участника');
    }
  }, [members, isLastOwner, workspaceId, queryClient]);

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    try {
      await revokeInvite.mutateAsync(inviteId);
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось отозвать приглашение');
    }
  }, [revokeInvite]);

  const handleResendInvite = useCallback(async (inviteId: string) => {
    try {
      const newToken = await resendInvite.mutateAsync(inviteId);
      setMemberError(null);
      setInviteToken(newToken);
      setMemberSuccess('Приглашение повторно отправлено. Новый токен создан.');
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось повторно отправить приглашение');
    }
  }, [resendInvite]);

  const handleDeleteProduct = useCallback(async (productId: string) => {
    try {
      await deleteProduct.mutateAsync(productId);
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить продукт');
    }
  }, [deleteProduct]);

  const handleUpdateProduct = useCallback(async (productId: string, data: { name: string; slug: string; description?: string | null }) => {
    try {
      await updateProduct.mutateAsync({ productId, ...data });
      setMemberError(null);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось обновить продукт');
    }
  }, [updateProduct]);

  const handleDeleteRelease = useCallback(async (releaseId: string) => {
    try {
      await deleteRelease.mutateAsync(releaseId);
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось удалить релиз');
    }
  }, [deleteRelease]);

  const handleCancelPublishedRelease = useCallback(async (releaseId: string, updatedAt?: string | null) => {
    try {
      await cancelPublishedRelease.mutateAsync({ releaseId, expectedUpdatedAt: updatedAt ?? null });
    } catch (err) {
      setMemberError((err as Error)?.message || 'Не удалось отменить релиз');
    }
  }, [cancelPublishedRelease]);

  return {
    workspaceId,
    navigate,
    user,
    isAuthLoading,
    activeTab,
    setActiveTab,
    memberEmail,
    setMemberEmail,
    memberRole,
    setMemberRole,
    memberError,
    setMemberError,
    memberSuccess,
    setMemberSuccess,
    inviteToken,
    isCreateModalOpen,
    setIsCreateModalOpen,
    editingProduct,
    setEditingProduct,
    deletingProduct,
    setDeletingProduct,
    workspace,
    isWsLoading,
    isWsError,
    wsError,
    members,
    invites,
    products,
    isProductsLoading,
    isProductsError,
    productsError,
    releases,
    isReleasesLoading,
    isReleasesError,
    releasesError,
    activity,
    isActivityLoading,
    deleteProduct,
    deleteRelease,
    cancelPublishedRelease,
    updateProduct,
    createInvite,
    revokeInvite,
    resendInvite,
    permissions,
    queryClient,
    statusFilter,
    searchFilter,
    sortOrder,
    page,
    pageSize,
    filteredReleases,
    totalPages,
    safePage,
    pagedReleases,
    updateParams,
    ownerCount,
    isLastOwner,
    handleInviteMember,
    handleMemberRoleChange,
    handleRemoveMember,
    handleRevokeInvite,
    handleResendInvite,
    handleDeleteProduct,
    handleUpdateProduct,
    handleDeleteRelease,
    handleCancelPublishedRelease,
  };
};
