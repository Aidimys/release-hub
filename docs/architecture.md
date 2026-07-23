# Архитектурное проектирование ReleaseHub

## 1. Роли и Матрица прав (Permissions Table)

| Действие / Ресурс                          |   Owner    | Maintainer |      Contributor       |
| :----------------------------------------- | :--------: | :--------: | :--------------------: |
| Редактировать Workspace                    |     ✅     |     ❌     |           ❌           |
| Управление участниками и ролями            |     ✅     |     ❌     |           ❌           |
| Создать / Удалить Продукт                  |     ✅     |     ❌     |           ❌           |
| Создать / Редактировать Релиз              |     ✅     |     ✅     |           ❌           |
| Отправить Релиз на Review                  |     ✅     |     ✅     |           ❌           |
| Согласовать / Отклонить Релиз              |     ✅     |     ✅     |           ❌           |
| Опубликовать Релиз                         |     ✅     |     ✅     |           ❌           |
| Отменить опубликованный релиз              |     ✅     |     ❌     |           ❌           |
| Просмотр Workspace и Релизов               |     ✅     |     ✅     |           ✅           |
| Создать / Редактировать Изменение (Change) |     ✅     |     ✅     |           ✅           |
| Удалить Изменение / Комментарий            | Свои/Чужие | Свои/Чужие | Только свои (неопубл.) |

## 2. Структура Маршрутов (Router Map)

- `/login` — Вход
- `/register` — Регистрация
- `/workspaces` — Список рабочих пространств (Protected)
- `/workspaces/:workspaceId` — Страница пространства (Вкладки: Products, Releases, Members, Activity, Settings)
- `/workspaces/:workspaceId/releases/:releaseId` — Страница релиза
- `/public/releases/:productId` — Публичные Release Notes (Unprotected)

## 3. Централизованная структура Query Keys

- `workspaceKeys`: `all`, `lists()`, `detail(id)`, `members(id)`
- `releaseKeys`: `all`, `list(workspaceId, filters)`, `detail(id)`, `changes(id)`, `comments(id)`, `activity(id)`
