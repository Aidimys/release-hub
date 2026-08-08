import type { ProductsTabProps } from '../../../features/workspaces/hooks/useWorkspaceDetailsPage';

export const ProductsTab = ({ products, isProductsLoading, isProductsError, productsError, permissions, workspaceId, setIsCreateModalOpen, setEditingProduct, setDeletingProduct, deleteProduct }: ProductsTabProps) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-bold text-gray-900">Список продуктов</h2>
        {permissions.canCreateProduct && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 text-sm"
          >
            + Добавить продукт
          </button>
        )}
      </div>

      {isProductsLoading ? (
        <div className="h-24 bg-gray-200 animate-pulse rounded-xl" />
      ) : isProductsError ? (
        <div className="text-center py-8 bg-red-50 rounded-xl border border-red-200 text-red-700">
          Ошибка загрузки продуктов.
          {productsError && (
            <div className="mt-2 text-xs bg-red-100 p-3 rounded-lg font-mono text-red-900 overflow-x-auto">
              {productsError.message}
            </div>
          )}
        </div>
      ) : products && products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div key={product.id} className="block bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition">
              <div className="flex items-start justify-between gap-2">
                <a href={`/workspaces/${workspaceId}/products/${product.id}`} className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900">{product.name}</h3>
                  <p className="text-xs text-gray-400 mt-1">Slug: {product.slug}</p>
                </a>
                <div className="flex gap-1 shrink-0">
                  {permissions.canEditProduct && (
                    <button
                      onClick={() => setEditingProduct(product)}
                      className="px-2 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                    >
                      Изменить
                    </button>
                  )}
                  {permissions.canDeleteProduct && (
                    <button
                      onClick={() => setDeletingProduct(product)}
                      disabled={deleteProduct.isPending}
                      className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
          В этом пространстве пока нет продуктов
        </div>
      )}
    </div>
  );
};
