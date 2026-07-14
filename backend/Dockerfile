# CaseMoney backend — production image
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Системные зависимости для psycopg2-binary обычно не нужны (binary),
# но libpq иногда требуется в рантайме — ставим минимально.
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Порт задаёт хостинг через $PORT (Render/Fly); по умолчанию 8000.
ENV PORT=8000
EXPOSE 8000

# Применяем миграции, затем запускаем сервер (без --reload).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY:-1}"]
