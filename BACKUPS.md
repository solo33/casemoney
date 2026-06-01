# Ежедневные бэкапы БД CaseMoney

Данные живут в PostgreSQL. Бэкап = `pg_dump` базы по расписанию + хранение
N последних копий. Ниже — варианты по месту хостинга.

Скрипт: `backend/scripts/backup_db.sh` — делает сжатый дамп и чистит старые.

---

## Вариант 1. Хостинг с управляемой БД (Render / Timeweb / Yandex Cloud) — проще всего

У управляемого Postgres почти всегда есть **автоматические ежедневные снапшоты**
из коробки — включаются в панели, ничего писать не нужно:

- **Render** — платные инстансы Postgres имеют daily backups + point-in-time
  recovery в дашборде (вкладка Backups). На free-плане ретеншн ограничен —
  для боевого включите платный план или дублируйте скриптом (вариант 3).
- **Timeweb Cloud / Selectel / Yandex Cloud Managed PostgreSQL** — в настройках
  кластера включается расписание автобэкапов и срок хранения. Это
  предпочтительный путь для прод-данных граждан РФ.

Действие: в панели БД включить «Backups / Резервное копирование», период —
ежедневно, ретеншн — 7–30 дней.

---

## Вариант 2. Свой сервер (VPS) — cron + скрипт

1. Установить клиент Postgres (для `pg_dump`):
   ```bash
   sudo apt-get install -y postgresql-client
   ```
2. Положить скрипт и сделать исполняемым:
   ```bash
   chmod +x /opt/casemoney/backend/scripts/backup_db.sh
   ```
3. Добавить задачу в cron (`crontab -e`) — каждый день в 03:30:
   ```cron
   30 3 * * * DATABASE_URL='postgresql://user:pass@localhost:5432/casemoney' \
     BACKUP_DIR='/var/backups/casemoney' KEEP_DAYS=14 \
     /opt/casemoney/backend/scripts/backup_db.sh >> /var/log/casemoney-backup.log 2>&1
   ```
4. Желательно копировать дампы ещё и **вне сервера** (S3-совместимое хранилище,
   Я.Объект, rclone), чтобы потеря сервера не означала потерю бэкапов:
   ```bash
   rclone copy /var/backups/casemoney remote:casemoney-backups
   ```

---

## Вариант 3. Бесплатно/без своего сервера — GitHub Actions по расписанию

Если БД доступна извне (или используете бесплатный Render Postgres), можно
гонять дамп по cron в GitHub Actions и складывать в artifacts (или в S3).

Создать `.github/workflows/backup.yml`:
```yaml
name: DB backup
on:
  schedule:
    - cron: "30 3 * * *"   # ежедневно 03:30 UTC
  workflow_dispatch: {}
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - run: |
          mkdir -p backups
          pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > backups/casemoney_$(date +%Y%m%d).sql.gz
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: backups/*.sql.gz
          retention-days: 30
```
`DATABASE_URL` положить в **Settings → Secrets and variables → Actions**.
Минус: artifacts хранятся ограниченное время и это не для чувствительных
прод-данных надолго — для боевого лучше слать в приватный S3.

---

## Восстановление из дампа

```bash
# создать пустую БД при необходимости
createdb casemoney_restore
# восстановить
gunzip -c casemoney_20260601_033000.sql.gz | psql "postgresql://user:pass@host:5432/casemoney_restore"
```

После восстановления проверьте версию схемы:
```bash
cd backend && alembic current   # должна совпадать с last migration
```

---

## Рекомендация

- **Прод (РФ, 152-ФЗ):** управляемый Postgres у российского провайдера с
  включёнными автобэкапами (вариант 1) + еженедельная выгрузка копии в
  отдельное хранилище.
- **Тест/демо:** хватит варианта 2 (cron на VPS) или 3 (Actions).
- Раз в месяц делайте **тестовое восстановление** — бэкап без проверки
  восстановления не считается рабочим.
