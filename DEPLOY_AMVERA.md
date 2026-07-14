# Деплой CaseMoney на Amvera

Схема: backend — Docker-приложение Amvera; PostgreSQL — managed-БД Amvera;
frontend — статика (сборка Vite), можно вторым приложением Amvera или любым
статик-хостингом.

## 0. Что уже готово в коде

- `backend/Dockerfile` — прод-образ: `alembic upgrade head && uvicorn`, порт
  берётся из `$PORT` (по умолчанию 8000), без `--reload`.
- Alembic читает `DATABASE_URL` из окружения (приоритетнее alembic.ini) —
  миграции в контейнере идут в managed-БД, а не в localhost.
- Все настройки backend — через переменные окружения (см. шаг 2).
- Frontend берёт адрес API из `VITE_API_URL` на этапе сборки.

## 1. PostgreSQL (managed)

1. В Amvera создать сервис PostgreSQL.
2. Создать БД `casemoney` (или использовать дефолтную).
3. Сохранить строку подключения вида
   `postgresql://USER:PASSWORD@HOST:5432/casemoney`.
   Внутри сети Amvera host обычно вида `amvera-<user>-run-<project>`.

## 2. Backend

1. Создать приложение, тип «Docker» (конфигурация — `backend/amvera.yml`).
2. Подключить репозиторий. Amvera собирает из корня репо, поэтому пушим
   только backend:
   ```
   git remote add amvera <амвера-репо-URL>
   git subtree push --prefix backend amvera master
   ```
   (альтернатива — отдельный репозиторий из содержимого backend/).
3. Переменные окружения приложения:

   | Переменная         | Значение |
   |--------------------|----------|
   | `DATABASE_URL`     | строка из шага 1 |
   | `SECRET_KEY`       | `python -c "import secrets; print(secrets.token_urlsafe(64))"` — НОВЫЙ, не из dev |
   | `APP_URL`          | https-адрес фронтенда (ссылки в письмах) |
   | `CORS_ORIGINS`     | https-адрес(а) фронтенда через запятую |
   | `SMTP_HOST/PORT/USER/PASSWORD/FROM` | если нужны реальные письма; без них — вывод в лог |
   | `RATELIMIT_ENABLED`| не задавать (включён по умолчанию) |

4. Задеплоить. Проверка: `https://<backend-домен>/health` → `{"status":"ok"}`.

## 3. Frontend

1. Собрать статику с прод-адресом API:
   ```
   cd frontend
   echo VITE_API_URL=https://<backend-домен>> .env.production
   npm ci && npm run build
   ```
2. Выложить `frontend/dist/` — вторым приложением Amvera (static/Node) или
   любым статик-хостингом с HTTPS. SPA-fallback: все пути → `index.html`
   (для React Router).
3. HTTPS обязателен: без него не работает PWA (service worker).

## 4. После деплоя — чеклист

- [ ] `/health` отвечает; `/docs` открывается.
- [ ] Регистрация/логин с прод-фронта (CORS не ругается).
- [ ] Письмо активации уходит (или виден код в логах, если SMTP не настроен).
- [ ] Импорт CSV из HomeMoney работает.
- [ ] PWA ставится с телефона (HTTPS + manifest).
- [ ] В backend-логах нет ошибок подключения к БД.
- [ ] SECRET_KEY прода нигде не совпадает с dev.

## Известные ограничения

- Кэш превью импорта хранится в памяти процесса — при 2+ воркерах uvicorn
  confirm может не найти preview с другого воркера. В Dockerfile сейчас
  `--workers 2`: если это проявится, снизить до 1 или вынести кэш в БД/Redis.
- Amvera: файловая система контейнера эфемерна — ничего важного на диск не
  писать (сейчас и не пишем).
