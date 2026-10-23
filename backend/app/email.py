"""Transactional email through Resend's HTTPS API.

Railway blocks outbound SMTP on the Hobby plan, so we call an HTTPS API instead.
With no RESEND_API_KEY set, messages are written to the log so you can still
copy a reset link from Railway's logs.
"""

import logging
from html import escape

import httpx

from .config import get_settings

log = logging.getLogger("salon.email")


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    s = get_settings()
    if not s.resend_api_key:
        log.warning("EMAIL NOT SENT (RESEND_API_KEY not set). To: %s | Subject: %s\n%s", to, subject, text)
        return False
    try:
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {s.resend_api_key}"},
            json={"from": s.email_from, "to": [to], "subject": subject, "html": html, "text": text},
            timeout=10,
        )
        if r.status_code >= 300:
            log.error("Resend rejected email to %s: %s %s", to, r.status_code, r.text[:300])
            return False
        return True
    except httpx.HTTPError as e:
        log.error("Could not reach Resend for email to %s: %s", to, e)
        return False


def password_reset_email(name: str, link: str, minutes: int) -> tuple[str, str, str]:
    brand = get_settings().brand_name
    first = (name or "").split(" ")[0] or "there"
    safe_first, safe_link = escape(first), escape(link, quote=True)
    subject = f"Reset your {brand} password"
    text = (
        f"Hi {first},\n\n"
        f"Someone asked to reset the password for your {brand} account. "
        f"Open this link to choose a new password (it works once, for {minutes} minutes):\n\n"
        f"{link}\n\n"
        f"If you didn't ask for this, ignore this email. Your password won't change.\n\n"
        f"{brand}"
    )
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#2a1e17">
  <h2 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:normal">Reset your password</h2>
  <p>Hi {safe_first},</p>
  <p>Someone asked to reset the password for your {brand} account.
     This link works once and expires in {minutes} minutes.</p>
  <p style="margin:24px 0">
    <a href="{safe_link}" style="background:#b4532f;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">
      Choose a new password</a>
  </p>
  <p style="font-size:13px;color:#7a6a5c">If the button doesn't work, copy this link:<br>
     <span style="word-break:break-all">{safe_link}</span></p>
  <p style="font-size:13px;color:#7a6a5c">If you didn't ask for this, ignore this email. Your password won't change.</p>
</div>"""
    return subject, html, text
