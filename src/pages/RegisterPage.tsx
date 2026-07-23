import { RegisterForm } from '../features/auth/ui/RegisterForm';
import { Link } from 'react-router-dom';

export const RegisterPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            Создать аккаунт
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Уже зарегистрированы?{' '}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Войти в систему
            </Link>
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
};