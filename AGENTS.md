# AGENTS.md — CaseMoney

Контекст проекта для Codex. Читать перед любыми изменениями.

## О проекте
CaseMoney — веб-приложение личных финансов (улучшенный клон iHomeMoney).
Ядро MVP: auth, счета, категории, транзакции (доход/расход/перевод), дашборд с
графиками. Поверх уже есть: импорт/экспорт CSV, мультивалютность, цели, PWA и
Android-обёртка (Capacitor). Цель — публичный сервис с подпиской.

## Стек (по факту из репозитория)
- **Backend:** FastAPI 0.136 · SQLAlchemy 2.0 · Alembic 1.18 · PostgreSQL (psycopg2-binary) ·
  JWT (python-jose + passlib/bcrypt) · rate-limit (slowapi) · импорт/экспорт (openpyxl/xlrd).
  Python 3.12/3.13.
- **Frontend:** React 19 · Vite 8 · React Router 7 · Axios · Recharts · @dnd-kit ·
  PWA (vite-plugin-pwa). Чистый CSS, **Tailwind не используется**. CI собирает на **Node 22**.
- **Деплой:** backend (Docker) + managed PostgreSQL на Amvera.ru. В репо также есть
  `render.yaml` для бесплатного тестового деплоя на Render.

## Структура
```
backend/
  alembic.ini, alembic/        # миграции — на уровне backend/ (НЕ в app/)
  app/
    main.py                    # точка входа: app.main:app
    database.py                # engine/SessionLocal; грузит backend/.env по абсолютному пути
    constants.py, seeds.py     # seed_demo_user()
    api/  models/  schemas/  services/
  requirements.txt, requirements-dev.txt
  .env.example                 # шаблон; реальный backend/.env — в .gitignore
  tests/                       # pytest (pytest.ini, tests/conftest.py)
frontend/
  src/api/client.js            # axios baseURL = VITE_API_URL || http://localhost:8000
  .env.development / .env.production   # в .gitignore, создаются локально
  package.json                 # scripts: dev / build / lint / preview
  android/, capacitor.config.ts        # мобильная обёртка
```

## Локальный запуск
**Backend** (из `backend/`):
```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # затем вписать реальные DATABASE_URL и SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Проверка живости: http://localhost:8000/health и http://localhost:8000/docs

**Frontend** (из `frontend/`):
```
npm install
echo VITE_API_URL=http://localhost:8000> .env.development
npm run dev                     # http://localhost:5173
```

## База данных
- Формат: `DATABASE_URL=postgresql://postgres:<пароль>@localhost:5432/casemoney`
- `<пароль>` — заданный при установке PostgreSQL (через winget по умолчанию `postgres`).
- Базу создать один раз: `psql -U postgres -c "CREATE DATABASE casemoney;"`
- **Схема меняется ТОЛЬКО через Alembic.** `create_all` не вызываем — см. комментарий в
  `app/main.py`. Новые таблицы: модель в `app/models/`, импорт в `main.py`, затем
  `alembic revision --autogenerate -m "..."` и `alembic upgrade head`.

## Прочие переменные (backend/.env)
- `SECRET_KEY` — длинная случайная строка (JWT).
- `APP_URL` — http://localhost:5173 (ссылки в письмах активации/сброса).
- `CORS_ORIGINS` — http://localhost:5173,http://127.0.0.1:5173
- SMTP — опционально; без него письма выводятся в консоль (dev-режим).
- `RATELIMIT_ENABLED=0` — в тестах.

## Тесты
Из `backend/`: `pytest`. Перед прогоном — `RATELIMIT_ENABLED=0`.

## Управление задачами
Jira: sololoom.atlassian.net, проект **FIN**, cloudId `da617a3e-e0f3-420b-a865-737a96ed182b`.

## Как работать
- Объясняй **что** и **почему**, а не просто выдавай код.
- Точность по путям и именам критична — сверяйся с реальными файлами, не угадывай.
- Опорные факты: точка входа `app.main:app`, сид `seeds.py → seed_demo_user`,
  Alembic на уровне `backend/`, `.env` лежит в `backend/.env`.
