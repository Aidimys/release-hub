import type { ReviewersSectionProps } from '../../../features/workspaces/hooks/useReleaseDetailsPage';

export const ReviewersSection = ({ reviewers, isReviewersLoading, pendingReviewerIds, setPendingReviewerIds, permissions, isPublished, workspaceMembers, user, handleVote, isVotingClosed }: ReviewersSectionProps) => (
  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold text-gray-900">Согласование и голосование</h2>
      <span className="text-sm text-gray-500">{reviewers?.length ? `${reviewers.length} участника` : 'Нет данных'}</span>
    </div>
    <div className="flex flex-wrap gap-2 mb-4">
      <button onClick={() => handleVote('approved')} disabled={isVotingClosed || !reviewers?.some((reviewer) => reviewer.user_id === user?.id)} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Проголосовать за</button>
      <button onClick={() => handleVote('rejected')} disabled={isVotingClosed || !reviewers?.some((reviewer) => reviewer.user_id === user?.id)} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50">Проголосовать против</button>
    </div>
    {isReviewersLoading ? (
      <div className="h-16 bg-gray-200 animate-pulse rounded-xl" />
    ) : (
      <div className="space-y-3">
        {(reviewers ?? []).length > 0 && (
          <div className="space-y-2">
            {(reviewers ?? []).map((reviewer) => (
              <div key={reviewer.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{reviewer.profiles?.display_name ?? 'Участник'}</div>
                    <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-gray-100 text-gray-700">
                      {reviewer.decision ?? 'pending'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {reviewer.decided_at ? `Решение принято: ${new Date(reviewer.decided_at).toLocaleString('ru-RU')}` : 'Ожидает решения'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {pendingReviewerIds.length > 0 && (
          <div className="space-y-2">
            {pendingReviewerIds.map((userId) => {
              const member = (workspaceMembers ?? []).find((m) => m.user_id === userId);
              return (
                <div key={userId} className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{member?.profiles?.display_name ?? 'Участник'}</div>
                      <span className="px-2 py-1 rounded-full text-[11px] font-semibold uppercase bg-indigo-100 text-indigo-700">
                        pending
                      </span>
                    </div>
                    {permissions.canApproveRelease && !isPublished && (
                      <button
                        onClick={() => setPendingReviewerIds((current) => current.filter((id) => id !== userId))}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Убрать
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {((reviewers ?? []).length === 0 && pendingReviewerIds.length === 0) && (
          <div className="text-sm text-gray-500">К этому релизу пока не назначены ревьюеры.</div>
        )}
        {permissions.canApproveRelease && !isPublished && (
          <div className="flex items-center gap-2 pt-2">
            <select
              value=""
              onChange={(event) => {
                const userId = event.target.value;
                const existingIds = new Set((reviewers ?? []).map((r) => r.user_id).filter((id): id is string => !!id));
                if (userId && !pendingReviewerIds.includes(userId) && !existingIds.has(userId)) {
                  setPendingReviewerIds((current) => [...current, userId]);
                }
                event.target.value = '';
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              <option value="" disabled>Добавить согласующего...</option>
              {(workspaceMembers ?? [])
                .filter((m) => {
                  const uid = m.user_id ?? '';
                  return uid && !pendingReviewerIds.includes(uid) && !(reviewers ?? []).some((r) => r.user_id === uid);
                })
                .map((m) => (
                  <option key={m.user_id} value={m.user_id ?? ''}>
                    {m.profiles?.display_name ?? 'Участник'} ({m.role})
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>
    )}
  </div>
);
