import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateProduct } from '../../workspaces/api/useCreateProduct';


const createProductSchema = z.object({
  name: z.string().min(2, 'Название должно быть не менее 2 символов'),
  slug: z
    .string()
    .min(2, 'Slug должен быть не менее 2 символов')
    .regex(/^[a-z0-9-]+$/, 'Slug может содержать только строчные латинские буквы, цифры и дефисы'),
});

type FormData = z.infer<typeof createProductSchema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export const CreateProductModal = ({ isOpen, onClose, workspaceId }: Props) => {
  const [errorText, setErrorText] = useState<string | null>(null);
  const createProduct = useCreateProduct(workspaceId);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createProductSchema),
    defaultValues: { name: '', slug: '' },
  });

  const nameValue = watch('name');

  // Автоматическая генерация slug при вводе названия
  useEffect(() => {
    if (nameValue) {
      const generatedSlug = nameValue
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');
      setValue('slug', generatedSlug, { shouldValidate: true });
    }
  }, [nameValue, setValue]);

  if (!isOpen) return null;

  const onSubmit = async (data: FormData) => {
    setErrorText(null);
    try {
      await createProduct.mutateAsync({
        name: data.name,
        slug: data.slug,
      });
      reset();
      onClose();
    } catch (error: unknown) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось создать продукт');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Добавить продукт</h3>

        {errorText && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 rounded-lg">
            {errorText}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Название продукта
            </label>
            <input
              type="text"
              {...register('name')}
              disabled={isSubmitting}
              placeholder="E.g. iOS Application"
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
              placeholder="ios-application"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 font-mono text-sm"
            />
            {errors.slug && <p className="mt-1 text-xs text-red-600">{errors.slug.message}</p>}
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
              {isSubmitting ? 'Создание...' : 'Создать продукт'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};