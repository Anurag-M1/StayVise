"""
StayVise — Application Configuration
All settings are loaded from environment variables / .env file.
"""

from functools import lru_cache
from typing import List, Literal, Union

from pydantic import AnyHttpUrl, Field, config, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ────────────────────────────────────────────────────────────
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = False
    APP_NAME: str = "StayVise"
    APP_VERSION: str = "0.1.0"

    # ── Security ───────────────────────────────────────────────────────────────
    SECRET_KEY: str = Field(..., min_length=32, description="Secret for Access Tokens")
    REFRESH_SECRET_KEY: str = Field(..., min_length=32, description="Secret for Refresh Tokens")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 525600 # 1 year
    ADMIN_EMAILS: List[str] = ["dr.anuragkr@gmail.com"]

    # ── Database ───────────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        ...,
        description="PostgreSQL async DSN. Must use postgresql+asyncpg:// scheme.",
    )
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # ── Redis ──────────────────────────────────────────────────────────────────
    REDIS_URL: str = Field(..., description="Redis DSN")
    REDIS_RATE_LIMIT_DB: int = 1  # separate DB for rate-limiting keys

    # ── Razorpay ───────────────────────────────────────────────────────────────
    RAZORPAY_KEY_ID: str = Field(..., description="From Razorpay Dashboard → Settings → API Keys")
    RAZORPAY_KEY_SECRET: str = Field(
        ..., description="Generated once at API key creation; store safely"
    )
    RAZORPAY_ACCOUNT_NUMBER: str = Field(
        ..., description="Virtual Account / Route account number for escrow payouts"
    )
    RAZORPAY_WEBHOOK_SECRET: str = Field(
        ..., description="Set in Razorpay Dashboard → Webhooks → Secret"
    )

    # ── Messaging Service (Official Messaging API) ──────────────────────────────
    MESSAGING_ACCESS_TOKEN: str = Field(
        default="placeholder_token", 
        description="System User token from Meta Business Suite"
    )
    MESSAGING_APP_SECRET: str = Field(
        default="placeholder_secret",
        description="App Secret from Meta for Developers -> App Settings -> Basic"
    )
    MESSAGING_PHONE_NUMBER_ID: str = Field(
        default="placeholder_id",
        description="Phone Number ID from Meta for Developers → Messaging → API Setup"
    )
    MESSAGING_VERIFY_TOKEN: str = Field(
        default="placeholder_verify",
        description="Custom token you set when configuring the webhook in Meta"
    )
    MESSAGING_API_VERSION: str = "v20.0"
    MESSAGING_API_BASE: str = "https://graph.facebook.com"

    # ── CORS / Frontend ────────────────────────────────────────────────────────
    FRONTEND_URL: AnyHttpUrl = Field(
        default="https://stayvise.in",
        description="Frontend origin",
    )
    ALLOWED_ORIGINS: Union[List[str], str] = []

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[List[str], str]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # ── Business Rules ─────────────────────────────────────────────────────────
    ESCROW_FEE_PERCENT: float = Field(default=2.0, ge=0.0, le=10.0)

    MAX_MILESTONE_AMOUNT_INR: int = 1_000_000  # ₹10 lakh
    MIN_MILESTONE_AMOUNT_INR: int = 1        # ₹1 minimum

    # ── Monitoring ──────────────────────────────────────────────────────────────
    SENTRY_DSN: str = Field(default="", description="Sentry DSN for error tracking")
    PROMETHEUS_ENABLED: bool = True

    # ── Celery ─────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    # ── Email / Magic Link (Resend) ──────────────────────────────────────────
    RESEND_API_KEY: str = Field(default="re_test_placeholder", description="From resend.com")
    RESEND_FROM_EMAIL: str = Field(
        default="StayVise <onboarding@resend.dev>",
        description="Must be a domain you've verified in Resend"
    )
    SECURE_ACCESS_LINK_EXPIRE_MINUTES: int = 15

    @field_validator("CELERY_BROKER_URL", mode="before")
    @classmethod
    def default_celery_broker(cls, v: str, info: "ValidationInfo") -> str:  # type: ignore[name-defined]
        if not v and "REDIS_URL" in (info.data or {}):
            return str(info.data["REDIS_URL"])
        return v

    @field_validator("CELERY_RESULT_BACKEND", mode="before")
    @classmethod
    def default_celery_backend(cls, v: str, info: "ValidationInfo") -> str:  # type: ignore[name-defined]
        if not v and "REDIS_URL" in (info.data or {}):
            return str(info.data["REDIS_URL"])
        return v

    # ── Helpers ────────────────────────────────────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

# ValidationInfo is needed only inside validators; import here to keep top clean
from pydantic import ValidationInfo  # noqa: E402 — intentional late import


def get_settings() -> Settings:
    """
    Cached singleton for application settings.
    If environment variables are stale (placeholders), falls back to reading .env from disk.
    """
    s = Settings()
    
    # ── Hot-Reload Fallback ───────────────────────────────────────────────────
    # In Docker, environment variables are often stale (not updated when .env changes).
    # We check if the keys are still placeholders and re-read from disk if so.
    placeholder = "REDACTED_FOR_STABILITY"
    if s.RAZORPAY_KEY_ID == placeholder or "REDACTED" in s.RAZORPAY_KEY_ID:
        # Check standard .env locations (local and Docker)
        import os
        from pathlib import Path
        possible_paths = [
            Path("/app/.env"),
            Path(__file__).parent.parent.parent.parent / ".env",
            Path(__file__).parent.parent.parent / ".env",
            Path(".env"),
        ]
        
        env_path = None
        for p in possible_paths:
            try:
                if p.is_file():
                    env_path = p
                    break
            except Exception:
                continue
                
        if env_path:
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "RAZORPAY_KEY_ID":
                            s.RAZORPAY_KEY_ID = v
                        elif k == "RAZORPAY_KEY_SECRET":
                            s.RAZORPAY_KEY_SECRET = v
                        elif k == "RAZORPAY_ACCOUNT_NUMBER":
                            s.RAZORPAY_ACCOUNT_NUMBER = v
                        elif k == "RAZORPAY_WEBHOOK_SECRET":
                            s.RAZORPAY_WEBHOOK_SECRET = v
                            
    # ── Final Safety Override ────────────────────────────────────────────────
    # If standard environment loading failed, raise an error in production.
    if s.is_production and (not s.RAZORPAY_KEY_ID or "REDACTED" in s.RAZORPAY_KEY_ID):
        raise ValueError("RAZORPAY_KEY_ID is missing or invalid in production.")

    # Enforce security constraints
    if s.ACCESS_TOKEN_EXPIRE_MINUTES > 525600:
        s.ACCESS_TOKEN_EXPIRE_MINUTES = 525600
        
    return s


settings = get_settings()
