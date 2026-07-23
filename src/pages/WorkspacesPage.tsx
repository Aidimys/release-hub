import { useAuth } from '../app/providers/AuthProvider';

export const WorkspacesPage = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg p-6 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Рабочие пространства</h1>
          <p className="text-gray-600">Вы вошли как: {user?.email}</p>
        </div>
        <button
          onClick={signOut}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
        >
          Выйти
        </button>
      </div>
    </div>
  );
};