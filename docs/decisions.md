# Architectural decisions

## 1. Организация серверного состояния

Решение: использовать React Query как слой для серверного состояния, а Supabase — как источник данных.

Почему:

- UI становится декларативным: данные запрашиваются по ключам queryKey, а не через ручное состояние компонента;
- кэш позволяет одинаково использовать списки, детали и обновления без повторного запроса при навигации;
- легко интегрировать Realtime и invalidate/refetch после событий из БД.

Как это реализовано:

- hooks в `src/features` и `src/shared/api` запрашивают данные через `supabase.from(...)` и `supabase.rpc(...)`;
- `useSupabaseRealtime.ts` отслеживает события Postgres и обновляет cache;
- `ReleaseDetailsPage` использует queryClient для optimistic update редакции статуса релиза и списков в workspace/product.

Плюсы:

- меньше дублирования состояния;
- быстрые перерисовки и согласованность when you navigate cross features;
- упрощение синхронизации после Realtime событий.

Ограничения:

- часть данных всё равно должна контролироваться на стороне БД;
- без корректного ключа queryKey легко получить stale cache и дублирование данных.

---

## 2. Синхронизация TypeScript-моделей с БД

Решение: генерировать типы из схемы Supabase и хранить их в `src/shared/api/database.types.ts`.

Почему:

- типы для `workspace_role`, `release_status`, `change_category` и RPC-аргументов должны соответствовать реальной схеме БД;
- это уменьшает шанс расхождения между SQL и TypeScript;
- упрощает поддержку изменений схемы.

Как реализовано:

- команда `npm run gen:types` запускает `supabase gen types typescript --linked`;
- `src/shared/api/supabase.ts` создаёт клиент с generic `Database`.

Плюсы:

- наличие автодополнения и проверки TS на уровне SQL схемы;
- меньший риск ошибок при вызове `supabase.from()` и `.rpc()`.

Ограничения:

- файл генерируется вручную/посредством CLI и требует регулярного обновления после миграций;
- если в проекте используются локальные и облачные схемы, могут появляться расхождения на этапах релиза.

---

## 3. Реализация ролей и RLS

Решение: смешанная модель — RBAC на уровне UI + строгие проверки на уровне Postgres через RLS и SECURITY DEFINER RPC.

Почему:

- UI должен давать понятные ограничения пользователю;
- SQL должен защищать данные от обхода через API и прямые запросы;
- иначе приложение теряет безопасность даже при идеальной клиентской логике.

Как реализовано:

- `workspace_role` enum: `owner | maintainer | contributor`;
- `usePermissions.ts` вычисляет доступные действия по ролям;
- `supabase/migrations/...sql` содержит политики вида `Owners maintainers can update releases`, `Members can view products in same workspace` и др.;
- для сложных действий используются `create_workspace_with_defaults`, `create_invite`, `accept_invite`, `revoke_invite`, `resend_invite`, `change_member_role`, `remove_member`, `cancel_published_release`, `submit_release_for_review`, `cast_release_vote`, `publish_release`, `return_rejected_release_to_draft`.

Плюсы:

- Слабое место в клиенте не критично для сохранности данных;
- права можно описывать и тестировать как в SQL, так и в unit-тестах.

Ограничения:

- политики могут стать сложными и трудными для чтения;
- архитектура критично зависит от правильной настройки `auth.uid()` и membership checks.

---

## 4. Обработка optimistic update

Решение: для безопасных пользовательских операций использовать optimistic update с последующим откатом при ошибке.

Как это реализовано:

- в `ReleaseDetailsPage` при изменении статуса релиза сразу обновляется `queryClient.setQueryData(...)`;
- затем данные отправляются через SECURITY DEFINER RPC (`submit_release_for_review`, `cast_release_vote`, `publish_release`, `return_rejected_release_to_draft`);
- если запрос падает, данные в кэше откатываются до исходного значения.

Почему:

- пользователь видит реакцию интерфейса сразу;
- изменение статуса релиза воспринимается как мгновенное действие;
- форма UX комфортнее без ожидания ответа сервера.

Плюсы:

- сильно лучше UX;
- меньше ощущения "залипания" интерфейса.

Ограничения:

- optimistic update допустим только там, где действие безопасно и легко откатить;
- не все сценарии стоит делать optimistic: например, сложные multi-step workflows лучше фиксировать через сервер после подтверждения.

---

## 5. Обработка Realtime-событий

Решение: подписываться на `postgres_changes` по таблицам и обновлять связанный query cache.

Как реализовано:

- `useAppRealtime`, `useWorkspaceRealtime`, `useReleaseRealtime`, `useProductReleasesRealtime` создают каналы и подписываются на изменения в `workspaces`, `workspace_members`, `products`, `releases`, `release_changes`, `comments`, `release_reviewers`, `activity_events`;
- обработчики синхронизируют data в React Query через `invalidateQueries`, `refetchQueries` и `setQueryData`.

Почему:

- несколько клиентских вкладок/окон замечают обновления друг друга без ручного polling;
- списки релизов и детали обновляются почти мгновенно после изменений;
- Realtime делает интерфейс «живым» без перезагрузки страницы.

Плюсы:

- улучшает командную работу;
- уменьшает задержку между действием одного участника и отображением у другого.

Ограничения:

- realtime не заменяет серверную валидацию;
- при большом количестве пользовательских подписок возможны лишние invalidate/refetch events;
- логика обновления cache должна быть осторожной, иначе можно получить race conditions.
