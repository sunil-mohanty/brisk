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
    # Automatic WhatsApp messages (booking confirmations) through Meta's WhatsApp Cloud API.
    # Without these, confirmations wait on the owner's Today screen as one-tap WhatsApp links.
    whatsapp_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    # Approved message template for business-initiated messages, with 4 body variables:
    # {{1}} client first name, {{2}} service, {{3}} date & time, {{4}} salon name. Language code below.
    whatsapp_template: str | None = None
    whatsapp_template_lang: str = "en"
    # Quote template with buttons: body {{1}} first name, {{2}} salon, {{3}} what, {{4}} total, {{5}} valid until;
    # quick-reply buttons "Accept" and "Decline", and a URL button ending in the quote token.
    whatsapp_quote_template: str | None = None
    # Webhook: Meta checks VERIFY_TOKEN once when you subscribe, and signs every call with the app secret.
    whatsapp_verify_token: str | None = None
    whatsapp_app_secret: str | None = None
    # The business number in international format without "+", e.g. 971501234567. Used for "Accept on WhatsApp" links.
    whatsapp_business_number: str | None = None
    whatsapp_graph_url: str = "https://graph.facebook.com/v21.0"

    # Posting campaigns to each salon's own Facebook Page and Instagram (one Meta app for the platform).
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    meta_graph_url: str = "https://graph.facebook.com/v21.0"
    meta_dialog_url: str = "https://www.facebook.com/v21.0/dialog/oauth"
    # Facebook Login for Business: the Configuration ID (App Dashboard → Facebook Login for Business → Configurations).
    # New Meta apps need it; when set, the permissions come from the configuration instead of a scope list.
    meta_login_config_id: str | None = None
    # Posting campaign videos to each salon's YouTube channel (one Google Cloud project for the platform).
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_auth_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_token_url: str = "https://oauth2.googleapis.com/token"
    youtube_api_url: str = "https://www.googleapis.com/youtube/v3"
    youtube_upload_url: str = "https://www.googleapis.com/upload/youtube/v3/videos"

    # Optional AI background pictures for campaign banners (see ai_art.py). Off without a key.
    ai_image_provider: str = "fal"  # fal (FLUX schnell, ~USD 0.003 a picture) | openai (gpt-image-1 low)
    ai_image_key: str | None = None
    ai_images_per_month: int = 10  # per business
    ai_image_url: str | None = None  # override the provider's address (testing)

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        v = (v or "").strip()
        if not v or "${{" in v or "://" not in v:
            raise ValueError(
                "DATABASE_URL is empty or not a database address. On Railway, set it on the api service with "
                "'Add Reference' → your Postgres service → DATABASE_URL (it should look like postgresql://...)."
            )
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
