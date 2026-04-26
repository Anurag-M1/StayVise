# ── Stage 1: Build dependencies ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Copy dependency manifest first (Docker layer caching)
COPY pyproject.toml uv.lock* README.md* ./

# Install production dependencies only
RUN uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev

# ── Stage: Development ────────────────────────────────────────────────────────
FROM builder AS development
# Install ALL dependencies (including dev deps)
RUN uv sync 2>/dev/null || uv sync
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Source code is mounted at runtime via docker-compose
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Security: run as non-root
RUN groupadd -r stayvise && useradd -r -g stayvise stayvise

# Copy virtualenv from builder
COPY --from=builder /app/.venv ./.venv

# Copy application code
COPY ./app ./app
COPY alembic.ini ./
COPY alembic/ ./alembic/

# Environment
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

USER stayvise

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--loop", "uvloop", "--http", "httptools"]
