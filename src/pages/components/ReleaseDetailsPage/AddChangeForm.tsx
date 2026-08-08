import type { AddChangeFormProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';

export const AddChangeForm = ({ register, handleSubmit, errors, isSubmitting, isPublished, onSubmit }: AddChangeFormProps) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
    <h2 className="text-lg font-bold text-gray-900 mb-4">Добавить изменение</h2>

    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
          <select
            {...register('category')}
            disabled={isSubmitting || isPublished}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
          >
            <option value="feature">Feature</option>
            <option value="improvement">Improvement</option>
            <option value="bugfix">Bugfix</option>
            <option value="security">Security</option>
            <option value="breaking">Breaking</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
          <input
            type="text"
            {...register('title')}
            disabled={isSubmitting || isPublished}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
          />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
        <textarea
          {...register('description')}
          disabled={isSubmitting || isPublished}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
        />
        {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting || isPublished}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Сохранение...' : 'Добавить изменение'}
        </button>
      </div>
    </form>
  </div>
);
