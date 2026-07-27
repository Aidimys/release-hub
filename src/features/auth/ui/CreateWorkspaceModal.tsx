import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateWorkspace } from '../../workspaces/api/useWorkspaces';

const createWorkspaceSchema = z.object({
  name: z.string().min(2, 'Название должно быть не менее 2 символов'),
  defaultProduct: z.string().min(2, 'Название продукта должно быть не менее 2 символов'),
});

type FormData = z.infer<typeof createWorkspaceSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateWorkspaceModal = ({ isOpen, onClose }: Props) => {
  const [errorText, setErrorText] = useState<string | null>(null);
  const createWorkspace = useCreateWorkspace();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      defaultProduct: 'Main Product',
    },
  });

  if (!isOpen) return null;

  const onSubmit = async (data: FormData) => {
    setErrorText(null);
    try {
      await createWorkspace.mutateAsync({
        name: data.name,
        defaultProduct: data.defaultProduct,
      });
      reset();
      onClose();
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось создать рабочее пространство');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Создать рабочее пространство</h3>

        {errorText && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">
            {errorText}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название пространства
            </label>
            <input
              type="text"
              {...register('name')}
              disabled={isSubmitting}
              placeholder="E.g. Acme Corp"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Продукт по умолчанию
            </label>
            <input
              type="text"
              {...register('defaultProduct')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
            />
            {errors.defaultProduct && (
              <p className="mt-1 text-xs text-red-600">{errors.defaultProduct.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};