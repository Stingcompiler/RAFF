# syntax=docker/dockerfile:1
FROM python:3.14.9-slim-bookworm AS base
COPY --from=ghcr.io/astral-sh/uv:0.12.15 /uv /uvx /bin/
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app
RUN useradd --system --uid 10001 --home-dir /app raff

# Development image: dev dependencies, source is bind-mounted by Compose.
FROM base AS dev
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-install-project
USER raff
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Production image: runtime dependencies only, served by Gunicorn.
FROM base AS prod
ARG RAFF_VERSION=dev
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY . .
# The media volume takes this directory's owner on first use: the app must be able to write it.
RUN mkdir -p /media && chown raff:raff /media
ENV DJANGO_SETTINGS_MODULE=config.settings.prod \
    RAFF_VERSION=${RAFF_VERSION}
USER raff
EXPOSE 8000
CMD ["gunicorn", "config.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3"]
