import { Link } from 'react-router-dom';

export const ForbiddenPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
    <h1 className="text-4xl font-bold text-gray-800">403</h1>
    <p className="text-gray-600 my-2">У вас нет доступа к этой странице</p>
    <Link to="/workspaces" className="text-indigo-600 hover:underline">Вернуться в рабочие пространства</Link>
  </div>
);
