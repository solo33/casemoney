# Бесплатный деплой CaseMoney: Render + Neon

Схема рассчитана на тестовый публичный стенд:

- frontend — бесплатный Render Static Site;
- backend — бесплатный Render Web Service;
- PostgreSQL — Neon Free без 30-дневного срока удаления.

## 1. База Neon

1. Создать проект на https://console.neon.tech.
2. Скопировать строку подключения PostgreSQL из **Connect**. Она должна начинаться
   с `postgresql://` и содержать `sslmode=require`.
3. Сохранить строку: она понадобится как секрет `DATABASE_URL` в Render.

## 2. Render Blueprint

1. Открыть https://dashboard.render.com/blueprints.
2. Подключить GitHub-репозиторий `solo33/casemoney`.
3. Render прочитает `render.yaml` и создаст:
   - `casemoney-api-solo33`;
   - `casemoney-web-solo33`.
4. В запросе значения `DATABASE_URL` вставить строку из Neon.
5. Подтвердить создание Blueprint и дождаться обоих успешных деплоев.

Миграции Alembic запускаются автоматически перед backend. `SECRET_KEY` Render
генерирует автоматически. Проверка backend:
`https://casemoney-api-solo33.onrender.com/health`.

## Ограничения бесплатного стенда

- backend засыпает после 15 минут без запросов; первый запуск может занять около минуты;
- Render Free не разрешает исходящие SMTP-подключения на порты 25, 465 и 587;
- локальная файловая система backend временная, поэтому данные должны храниться в Neon;
- бесплатный Neon ограничен доступными compute-часами и 0,5 ГБ хранилища.

Для рабочих писем активации понадобится почтовый HTTP API либо другой backend-хостинг.
