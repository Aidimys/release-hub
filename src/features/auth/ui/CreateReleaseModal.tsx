import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateRelease } from '../../workspaces/api/useCreateRelease';

const createReleaseSchema = z.object({
  version: z.string().min(1, 'Укажите версию релиза'),
  title: z.string().min(2, 'Название должно быть не менее 2 символов'),
  description: z.string().optional(),
  plannedAt: z.string().optional(),
});

type FormData = z.infer<typeof createReleaseSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
}

export const CreateReleaseModal = ({ isOpen, onClose, productId }: Props) => {
  const [errorText, setErrorText] = useState<string | null>(null);
  const createRelease = useCreateRelease(productId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createReleaseSchema),
    defaultValues: {
      plannedAt: '',
    },
  });

  if (!isOpen) return null;

  const onSubmit = async (data: FormData) => {
    setErrorText(null);

    try {
      await createRelease.mutateAsync({
        productId,
        version: data.version.trim(),
        title: data.title.trim(),
        description: data.description?.trim(),
        status: 'draft',
        plannedAt: data.plannedAt || null,
      });

      reset();
      onClose();
    } catch (err: any) {
      setErrorText(err.message || 'Не удалось создать релиз');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-gray-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Создать релиз</h3>

        {errorText && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">
            {errorText}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Версия</label>
              <input
                type="text"
                {...register('version')}
                disabled={isSubmitting}
                placeholder="1.2.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
              />
              {errors.version && <p className="mt-1 text-xs text-red-600">{errors.version.message}</p>}
            </div>

          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Название релиза</label>
            <input
              type="text"
              {...register('title')}
              disabled={isSubmitting}
              placeholder="Новый релиз"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
            />
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
            <textarea
              {...register('description')}
              disabled={isSubmitting}
              rows={4}
              placeholder="Кратко опишите релиз"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Планируемая дата</label>
            <input
              type="date"
              {...register('plannedAt')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
            />
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
              {isSubmitting ? 'Создание...' : 'Создать релиз'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
