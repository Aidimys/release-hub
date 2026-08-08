import { useParams } from 'react-router-dom';
import { useWorkspaceDetailsPage, type ProductsTabProps, type ReleasesTabProps, type MembersTabProps, type ActivityTabProps } from '../features/workspaces/hooks/useWorkspaceDetailsPage';
import { CreateProductModal } from '../features/auth/ui/CreateProductModal';
import { EditProductModal } from '../features/workspaces/ui/EditProductModal';
import { DeleteConfirmModal } from '../features/workspaces/ui/DeleteConfirmModal';
import { ProductsTab } from './components/WorkspaceDetailsPage/ProductsTab';
import { ReleasesTab } from './components/WorkspaceDetailsPage/ReleasesTab';
import { MembersTab } from './components/WorkspaceDetailsPage/MembersTab';
import { ActivityTab } from './components/WorkspaceDetailsPage/ActivityTab';

type Tab = 'products' | 'releases' | 'members' | 'activity';

const BackHeader = ({ onBack }: { onBack: () => void }) => (
  <header className="bg-white border-b border-gray-200">
    <div className="max-w-6xl mx-auto px-4 py-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1 transition"
      >
        ← Назад к пространствам
      </button>
    </div>
  </header>
);

export const WorkspaceDetailsPage = () => {
  const { workspaceId: routeWorkspaceId } = useParams<{ workspaceId: string }>();
  const page = useWorkspaceDetailsPage(routeWorkspaceId ?? '');

  if (page.isAuthLoading || !routeWorkspaceId || page.isWsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => page.navigate('/workspaces')} />
        <div className="p-8 text-center text-gray-500 font-medium">
          Загрузка рабочего пространства...
        </div>
      </div>
    );
  }

  if (page.isWsError || !page.workspace) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackHeader onBack={() => page.navigate('/workspaces')} />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-bold mb-1">Ошибка загрузки пространства</h2>
            <p className="text-sm mb-3">
              Рабочее пространство не найдено или у вас нет к нему доступа.
            </p>
            {page.wsError && (
              <div className="text-xs bg-red-100/80 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
                Детали: {page.wsError.message}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const tabs: Record<Tab, string> = {
    products: 'Продукты',
    releases: 'Релизы',
    members: 'Участники',
    activity: 'Журнал активности',
  };

  const productsTabProps: ProductsTabProps = {
    products: page.products,
    isProductsLoading: page.isProductsLoading,
    isProductsError: page.isProductsError,
    productsError: page.productsError,
    permissions: page.permissions,
    workspaceId: page.workspaceId,
    setIsCreateModalOpen: page.setIsCreateModalOpen,
    setEditingProduct: page.setEditingProduct,
    setDeletingProduct: page.setDeletingProduct,
    deleteProduct: page.deleteProduct,
  };

  const releasesTabProps: ReleasesTabProps = {
    releases: page.releases,
    isReleasesLoading: page.isReleasesLoading,
    isReleasesError: page.isReleasesError,
    releasesError: page.releasesError,
    filteredReleases: page.filteredReleases,
    pagedReleases: page.pagedReleases,
    totalPages: page.totalPages,
    safePage: page.safePage,
    statusFilter: page.statusFilter,
    searchFilter: page.searchFilter,
    sortOrder: page.sortOrder,
    updateParams: page.updateParams,
    permissions: page.permissions,
    workspaceId: page.workspaceId,
    handleDeleteRelease: page.handleDeleteRelease,
    handleCancelPublishedRelease: page.handleCancelPublishedRelease,
    deleteRelease: page.deleteRelease,
    cancelPublishedRelease: page.cancelPublishedRelease,
  };

  const membersTabProps: MembersTabProps = {
    permissions: page.permissions,
    user: page.user,
    members: page.members,
    invites: page.invites,
    handleInviteMember: page.handleInviteMember,
    handleMemberRoleChange: page.handleMemberRoleChange,
    handleRemoveMember: page.handleRemoveMember,
    handleRevokeInvite: page.handleRevokeInvite,
    handleResendInvite: page.handleResendInvite,
    createInvite: page.createInvite,
    revokeInvite: page.revokeInvite,
    resendInvite: page.resendInvite,
    memberEmail: page.memberEmail,
    setMemberEmail: page.setMemberEmail,
    memberRole: page.memberRole,
    setMemberRole: page.setMemberRole,
    inviteToken: page.inviteToken,
    memberSuccess: page.memberSuccess,
    setMemberSuccess: page.setMemberSuccess,
  };

  const activityTabProps: ActivityTabProps = {
    activity: page.activity,
    isActivityLoading: page.isActivityLoading,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <BackHeader onBack={() => page.navigate('/workspaces')} />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{page.workspace.name}</h1>
              <p className="text-xs text-gray-500">ID: {page.workspace.id}</p>
            </div>
            <span className="px-3 py-1 bg-indigo-100 text-indigo-800 font-semibold text-xs rounded-full uppercase">
              Ваша роль: {page.permissions.role}
            </span>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-8">
          {(Object.keys(tabs) as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => page.setActiveTab(tab)}
              className={`py-4 text-sm font-medium border-b-2 transition ${
                page.activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tabs[tab]}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {page.memberError && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">{page.memberError}</div>
        )}
        {page.memberSuccess && (
          <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-lg">{page.memberSuccess}</div>
        )}

        {page.activeTab === 'products' && <ProductsTab {...productsTabProps} />}
        {page.activeTab === 'releases' && <ReleasesTab {...releasesTabProps} />}
        {page.activeTab === 'members' && <MembersTab {...membersTabProps} />}
        {page.activeTab === 'activity' && <ActivityTab {...activityTabProps} />}
      </main>

      <CreateProductModal
        isOpen={page.isCreateModalOpen}
        onClose={() => page.setIsCreateModalOpen(false)}
        workspaceId={page.workspaceId}
      />

      <EditProductModal
        isOpen={!!page.editingProduct}
        currentName={page.editingProduct?.name ?? ''}
        currentSlug={page.editingProduct?.slug ?? ''}
        currentDescription={page.editingProduct?.description ?? ''}
        onClose={() => page.setEditingProduct(null)}
        onSubmit={async (data) => {
          if (!page.editingProduct) return;
          await page.handleUpdateProduct(page.editingProduct.id, data);
          page.setEditingProduct(null);
        }}
      />

      <DeleteConfirmModal
        isOpen={!!page.deletingProduct}
        title="Удалить продукт?"
        message={
          page.deletingProduct
                ? `Вы уверены, что хотите удалить продукт «${page.deletingProduct.name}»? Все связанные релизы и их данные (изменения, комментарии, ревьюеры) будут также удалены. Это действие необратимо.`
            : ''
        }
        confirmLabel="Удалить"
        danger
        onConfirm={async () => {
          if (page.deletingProduct) {
            await page.handleDeleteProduct(page.deletingProduct.id);
            page.setDeletingProduct(null);
          }
        }}
        onClose={() => page.setDeletingProduct(null)}
      />
    </div>
  );
};
