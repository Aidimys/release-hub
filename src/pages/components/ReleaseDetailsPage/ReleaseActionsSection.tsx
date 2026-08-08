import type { ReleaseActionsSectionProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';

export const ReleaseActionsSection = ({ permissions, releaseStatus, handleStatusChange }: ReleaseActionsSectionProps) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
    <h2 className="text-lg font-bold text-gray-900 mb-4">Доступные действия</h2>
    <div className="flex flex-wrap gap-2">
      {permissions.canSendForReview && (
        <button onClick={() => handleStatusChange('review')} disabled={releaseStatus !== 'draft'} className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white disabled:opacity-50">Отправить на review</button>
      )}
      {permissions.canPublishRelease && (
        <button onClick={() => handleStatusChange('published')} disabled={releaseStatus !== 'approved'} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Опубликовать</button>
      )}
    </div>
    <p className="text-sm text-gray-500 mt-4">Статус approved устанавливается автоматически, когда все согласующие проголосуют за релиз.</p>
  </div>
);
