import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import { useAcceptInvite } from '../features/workspaces/api/useWorkspaceDetails';

export const AcceptInvitePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') ?? '';
  const [token, setToken] = useState(tokenFromUrl);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { mutateAsync: acceptInvite, isPending } = useAcceptInvite();

  const handleAccept = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      const message = await acceptInvite(token.trim());
      setSuccess(message);
      setTimeout(() => navigate('/workspaces'), 2000);
    } catch (err) {
      setError((err as Error)?.message || 'Не удалось принять приглашение');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm max-w-sm w-full">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Примите приглашение</h1>
          <p className="text-sm text-gray-600 mb-4">
            Для принятия приглашения необходимо войти в аккаунт.
          </p>
          <Link
            to={`/login?redirectTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}
            className="block w-full px-4 py-2 text-sm font-medium text-center text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Войти
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm max-w-md w-full">
        <h1 className="text-xl font-bold text-gray-900 mb-4">Принять приглашение</h1>

        {error && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>
        )}
        {success && (
          <div className="mb-4 p-3 text-sm text-green-700 bg-green-100 rounded-lg">{success}</div>
        )}

        {!success && (
          <form onSubmit={handleAccept} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Токен приглашения
              </label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Введите токен приглашения"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={isPending || !token.trim()}
              className="w-full px-4 py-2 text-sm font-medium text-center text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? 'Принятие...' : 'Принять приглашение'}
            </button>
          </form>
        )}

        <div className="mt-4 text-center">
          <Link
            to="/workspaces"
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← Назад к пространствам
          </Link>
        </div>
      </div>
    </div>
  );
};
