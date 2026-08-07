import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const editProductSchema = z.object({
  name: z.string().min(2, 'Название должно быть не менее 2 символов'),
  slug: z
    .string()
    .min(2, 'Slug должен быть не менее 2 символов')
    .regex(/^[a-z0-9-]+$/, 'Slug может содержать только строчные латинские буквы, цифры и дефисы'),
  description: z.string().optional(),
});

type FormData = z.infer<typeof editProductSchema>;

interface Props {
  isOpen: boolean;
  currentName: string;
  currentSlug: string;
  currentDescription?: string | null;
  onClose: () => void;
  onSubmit: (data: { name: string; slug: string; description?: string | null }) => Promise<void>;
}

export const EditProductModal = ({ isOpen, currentName, currentSlug, currentDescription, onClose, onSubmit }: Props) => {
  const [errorText, setErrorText] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(editProductSchema),
    defaultValues: { name: currentName, slug: currentSlug, description: currentDescription ?? '' },
  });

  useEffect(() => {
    if (isOpen) {
      reset({ name: currentName, slug: currentSlug, description: currentDescription ?? '' });
    }
  }, [currentName, currentSlug, currentDescription, isOpen, reset]);

  if (!isOpen) return null;

  const onFormSubmit = async (data: FormData) => {
    setErrorText(null);
    try {
      await onSubmit({
        name: data.name.trim(),
        slug: data.slug.trim(),
        description: data.description?.trim() || null,
      });
      onClose();
    } catch (error: unknown) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось обновить продукт');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Редактировать продукт</h3>

        {errorText && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">
            {errorText}
          </div>
        )}

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название продукта
            </label>
            <input
              type="text"
              {...register('name')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug (уникальный идентификатор)
            </label>
            <input
              type="text"
              {...register('slug')}
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 font-mono text-sm"
            />
            {errors.slug && <p className="mt-1 text-xs text-red-600">{errors.slug.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Описание
            </label>
            <textarea
              {...register('description')}
              disabled={isSubmitting}
              rows={3}
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
              {isSubmitting ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
