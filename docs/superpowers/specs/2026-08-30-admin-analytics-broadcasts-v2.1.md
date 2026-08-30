# Друзья — админка, аналитика, рассылки (v2.1)

Дата: 2026-08-30  
Статус: реализовано  
База: `2026-08-30-friends-v2-expansion-design.md`

## Что сделано

### initData / Mini App «Игры»
- Reply-клавиатура гостя и персонала открывает Mini App через `web_app` в один тап.
- Убран двухшаговый flow (текст → inline «Открыть»).
- При пустом `initData` miniapp показывает понятную подсказку.

### Справочник гостей
- `GET /api/admin/guests` — пагинация, сортировка, фильтры.
- Вкладка «Гости»: режимы «Список» и «Поиск».
- `GET /api/admin/guest/:id/visit-pattern` — паттерн посещений.
- Карточка гостя: блок «Когда бывает», личное сообщение.

### Дашборд
- Периоды 7 / 30 / 90 / 180 / 365 дней.
- Гранулярность: день / неделя / месяц.
- Метрики: визиты, check-in, бонусы, регистрации, игры, уник. гости.
- Heatmap 7×24 (визиты / check-in), KPI: визитов/день, пик, % повторных.
- `GET /api/admin/stats/heatmap`

### Рассылки
- История в `Promo` (`broadcastSegment`, recipients, sent, failed).
- `GET /api/admin/broadcasts`
- Веб-форма: «Только в ленту (не отправлять)».

### Личное сообщение гостю
- `POST /api/admin/guest/:id/message`
- `StaffActionLog` action `guest_message`.

## Миграция

`prisma/migrations/20260830230000_admin_analytics_v21/migration.sql`

```bash
npx prisma migrate deploy
```
