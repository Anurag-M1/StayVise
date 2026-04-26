# StayVise Backend — README

## Local Development (without Docker)

### Prerequisites
- Python 3.12+
- [uv](https://github.com/astral-sh/uv) (`pip install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- PostgreSQL 16 running locally (or via Docker)
- Redis 7 running locally (or via Docker)

### Setup

```bash
cd backend
uv venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
uv pip install -e ".[dev]"
```

### Run

```bash
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs
Health:   http://localhost:8000/health
