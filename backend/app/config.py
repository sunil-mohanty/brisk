from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # postgresql+psycopg://user:pass@host:5432/db  (sqlite works for local tests)
    # The product name shown in emails, PDFs and messages. Change it here (or with BRAND_NAME).
    brand_name: str = "Tressa"
    database_url: str = "postgresql+psycopg://salon:salon@localhost:5432/salon"
    jwt_secret: str = "dev-only-secret-change-me-before-deploying!!"
    jwt_expiry_hours: int = 24 * 7
    # Public URL of the Next.js app. Used to build customer links and QR targets.
    app_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"
    # Ignore repeat views of the same quote from the same client within this window.
    quote_view_dedupe_seconds: int = 120
    create_tables_on_startup: bool = False
    # Older shared invite code. Still accepted if someone types it; no longer required.
    signup_code: str | None = None
    # Password reset emails go through Resend's HTTPS API (Railway blocks SMTP on Hobby).
    # Without a key, the reset link is written to the API log instead.
    resend_api_key: str | None = None
    email_from: str = "Tressa <no-reply@tressa.app>"
    password_reset_minutes: int = 60
    # Emails (comma-separated) that can open /admin.
    admin_emails: str = ""
    # Anyone can sign up from the website and gets a free trial. Set OPEN_SIGNUP=false to require invite codes.
    open_signup: bool = True
    signup_trial_days: int = 14
    signup_plan: str | None = "Starter"
    signup_plan_amount: float | None = None  # AED per month, shown to you in admin; leave empty to set per SME
    signups_per_ip_per_hour: int = 8

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        # Railway, Render and Heroku hand out postgres:// or postgresql:// URLs.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
