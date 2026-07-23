import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../shared/api/supabase';

const registerSchema = z
  .object({
    displayName: z.string().min(2, 'Имя должно содержать не менее 2 символов'),
    email: z.string().email('Введите корректный email'),
    password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterForm = () => {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    setSuccessMessage(null);

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.displayName,
        },
      },
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccessMessage('Регистрация прошла успешно! Выполняется переход...');
    setTimeout(() => {
      navigate('/workspaces');
    }, 1500);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left" noValidate>
      {serverError && (
        <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg border border-red-200">
          {serverError}
        </div>
      )}

      {successMessage && (
        <div className="p-3 text-sm text-green-700 bg-green-100 rounded-lg border border-green-200">
          {successMessage}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Имя и фамилия</label>
        <input
          type="text"
          {...register('displayName')}
          disabled={isSubmitting}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-gray-900"
          placeholder="Иван Иванов"
        />
        {errors.displayName && (
          <p className="mt-1 text-xs text-red-600">{errors.displayName.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          {...register('email')}
          disabled={isSubmitting}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-gray-900"
          placeholder="name@company.com"
        />
        {errors.email && (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
        <input
          type="password"
          {...register('password')}
          disabled={isSubmitting}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-gray-900"
          placeholder="••••••••"
        />
        {errors.password && (
          <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Подтвердите пароль</label>
        <input
          type="password"
          {...register('confirmPassword')}
          disabled={isSubmitting}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 text-gray-900"
          placeholder="••••••••"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-2.5 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition disabled:opacity-50"
      >
        {isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
      </button>
    </form>
  );
};