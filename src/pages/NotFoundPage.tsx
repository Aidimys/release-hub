import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
    <h1 className="text-4xl font-bold text-gray-800">404</h1>
    <p className="text-gray-600 my-2">Страница не найдена</p>
    <Link to="/" className="text-indigo-600 hover:underline">На главную</Link>
  </div>
);