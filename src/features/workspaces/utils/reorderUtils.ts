export interface ReorderItem {
  id: string;
  position: number;
}

export const reorderItems = (items: ReorderItem[], draggedId: string, targetId: string): ReorderItem[] => {
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);

  if (fromIndex === -1 || toIndex === -1 || draggedId === targetId) {
    return items.slice().map((item, index) => ({ ...item, position: index }));
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((item, index) => ({ ...item, position: index }));
};
