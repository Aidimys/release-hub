import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../shared/api/supabase';

interface WorkspaceMemberOption {
  user_id: string | null;
  role: string;
  profiles?: {
    display_name?: string | null;
  } | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  releaseId: string;
  currentReviewers: Array<{ id: string; user_id: string | null }>;
}

export const ReleaseReviewersModal = ({ isOpen, onClose, workspaceId, releaseId, currentReviewers }: Props) => {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !workspaceId) return;

    const loadMembers = async () => {
      setIsLoading(true);
      setErrorText(null);

      const { data, error } = await supabase
        .from('workspace_members')
        .select(`user_id, role, profiles (display_name)`)
        .eq('workspace_id', workspaceId);

      if (error) {
        setErrorText(error.message);
        setMembers([]);
      } else {
        setMembers((data ?? []) as WorkspaceMemberOption[]);
        setSelectedIds(currentReviewers.map((reviewer) => reviewer.user_id ?? '').filter(Boolean));
      }

      setIsLoading(false);
    };

    void loadMembers();
  }, [isOpen, workspaceId, currentReviewers]);

  const options = useMemo(() => {
    return members.filter((member) => member.user_id);
  }, [members]);

  const toggleMember = (userId: string) => {
    setSelectedIds((current) => {
      if (current.includes(userId)) {
        return current.filter((item) => item !== userId);
      }
      return [...current, userId];
    });
  };

  const saveReviewers = async () => {
    setErrorText(null);

    try {
      const selectedUserIds = selectedIds.filter(Boolean);
      const existingIds = currentReviewers.map((reviewer) => reviewer.user_id ?? '').filter(Boolean);

      const toDelete = existingIds.filter((userId) => !selectedUserIds.includes(userId));
      const toAdd = selectedUserIds.filter((userId) => !existingIds.includes(userId));

      if (toDelete.length > 0) {
        await supabase.from('release_reviewers').delete().eq('release_id', releaseId).in('user_id', toDelete);
      }

      if (toAdd.length > 0) {
        const inserts = toAdd.map((userId) => supabase.from('release_reviewers').insert({ release_id: releaseId, user_id: userId }));
        const results = await Promise.all(inserts);
        const firstError = results.find((result: { error?: { message?: string } | null }) => Boolean(result.error));
        if (firstError?.error) {
          throw new Error(firstError.error.message);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['release_reviewers', releaseId] });
      onClose();
    } catch (error: unknown) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось сохранить согласующих');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-900">Назначить согласующих</h3>
          <button onClick={onClose} className="text-sm text-gray-500">Закрыть</button>
        </div>

        {errorText && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">{errorText}</div>
        )}

        {isLoading ? (
          <div className="text-sm text-gray-500">Загрузка участников...</div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-auto">
            {options.length === 0 ? (
              <p className="text-sm text-gray-500">В этом пространстве нет доступных участников.</p>
            ) : options.map((member) => {
              const userId = member.user_id ?? '';
              const isSelected = selectedIds.includes(userId);

              return (
                <label key={userId} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 cursor-pointer">
                  <div>
                    <div className="font-medium text-gray-900">{member.profiles?.display_name ?? 'Участник'}</div>
                    <div className="text-xs text-gray-500">{member.role}</div>
                  </div>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleMember(userId)} className="h-4 w-4" />
                </label>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
            Отмена
          </button>
          <button type="button" onClick={() => void saveReviewers()} className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
