import type { MembersTabProps } from '../../../features/workspaces/hooks/useWorkspaceDetailsPage';

export const MembersTab = ({ permissions, user, members, invites, handleInviteMember, handleMemberRoleChange, handleRemoveMember, handleRevokeInvite, handleResendInvite, createInvite, revokeInvite, resendInvite, memberEmail, setMemberEmail, memberRole, setMemberRole, inviteToken, setMemberSuccess }: MembersTabProps) => {
  return (
    <div className="space-y-4">
      {permissions.canManageMembers ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
            Пригласить участника
          </div>
          <form onSubmit={handleInviteMember} className="p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr_auto]">
              <input
                value={memberEmail}
                onChange={(event) => setMemberEmail(event.target.value)}
                placeholder="Email пользователя"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <select
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value as 'owner' | 'maintainer' | 'contributor')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="contributor">Contributor</option>
                <option value="maintainer">Maintainer</option>
              </select>
              <button type="submit" className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white">
                Пригласить
              </button>
            </div>
            {createInvite.isPending && (
              <div className="text-xs text-gray-500">Создание приглашения...</div>
            )}
          </form>
          {inviteToken && (
            <div className="p-3 bg-indigo-50 border-t border-indigo-200">
              <div className="text-xs text-indigo-700 font-medium mb-2">
                Приглашение создано. Поделитесь этой ссылкой с пользователем:
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono break-all text-indigo-800 bg-white p-2 rounded border border-indigo-200">
                  {`${window.location.origin}/accept-invite?token=${inviteToken}`}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/accept-invite?token=${inviteToken}`
                    );
                    setMemberSuccess('Ссылка скопирована в буфер обмена');
                  }}
                  className="px-3 py-1 text-xs font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-100 shrink-0"
                >
                  Копировать
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
          У вас нет прав приглашать участников в это пространство.
        </div>
      )}

      {invites && invites.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
            Ожидающие приглашения
          </div>
          <div className="divide-y divide-gray-100">
            {invites.map((invite) => {
              const isPending = invite.status === 'pending';
              const isExpired = invite.status === 'expired' || (new Date(invite.expires_at) < new Date());
              const isAccepted = invite.status === 'accepted';
              const isRevoked = invite.status === 'revoked';
              const canAct = permissions.role === 'owner' && isPending;

              let statusLabel = '';
              if (isPending) statusLabel = 'Ожидает подтверждения';
              else if (isExpired) statusLabel = 'Просрочено';
              else if (isAccepted) statusLabel = 'Принято';
              else if (isRevoked) statusLabel = 'Отозвано';

              return (
                <div key={invite.id} className="p-4 flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                  <div>
                    <div className="font-medium text-gray-900">{invite.email}</div>
                    <div className="text-xs text-gray-400">Роль: {invite.role}</div>
                    <div className="text-xs text-gray-400">Статус: {statusLabel}</div>
                    <div className="text-xs text-gray-400">
                      Истекает: {new Date(invite.expires_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  {canAct && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResendInvite(invite.id)}
                        disabled={resendInvite.isPending}
                        className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Повторить
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        disabled={revokeInvite.isPending}
                        className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Отозвать
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 font-bold text-gray-900">
          Участники команды ({members?.length ?? 0})
        </div>
        <div className="divide-y divide-gray-100">
          {(members ?? []).map((member) => (
            <div key={member.user_id} className="p-4 flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
              <div>
                <div className="font-medium text-gray-900">
                  {member.profiles?.display_name || 'Пользователь'}
                </div>
                <div className="text-xs text-gray-400">{member.user_id}</div>
                {member.invited_email && (
                  <div className="text-xs text-gray-400">Приглашён: {member.invited_email}</div>
                )}
                {member.status && member.status !== 'active' && (
                  <div className="text-xs text-gray-400">Статус: {member.status}</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {member.user_id !== user?.id && permissions.role === 'owner' && (
                  <select
                    value={member.role}
                    onChange={(event) => handleMemberRoleChange(member.user_id, event.target.value as 'owner' | 'maintainer' | 'contributor')}
                    className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-900"
                    disabled={member.role === 'owner' && permissions.role !== 'owner'}
                  >
                    <option value="contributor">Contributor</option>
                    <option value="maintainer">Maintainer</option>
                    <option value="owner">Owner</option>
                  </select>
                )}
                {member.user_id !== user?.id && permissions.role !== 'owner' && (
                  <span className="text-xs text-gray-500">{member.role}</span>
                )}
                {member.user_id !== user?.id && permissions.role === 'owner' && member.role !== 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.user_id)}
                    className="px-2 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
