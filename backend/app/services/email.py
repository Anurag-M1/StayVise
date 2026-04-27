import logging
import resend
from app.core.config import settings

logger = logging.getLogger("stayvise.email")

class SecureAccessService:
    def __init__(self):
        if settings.RESEND_API_KEY and "placeholder" not in settings.RESEND_API_KEY:
            resend.api_key = settings.RESEND_API_KEY
        self.enabled = bool(settings.RESEND_API_KEY and "placeholder" not in settings.RESEND_API_KEY)

    async def send_secure_access_link(self, email: str, link: str):
        """
        Send a secure access login link via Resend.
        In development/mock mode, it just logs the link.
        """
        # If no key is set or it's just a placeholder, log it instead of failing
        if not self.enabled:
            logger.info("DEV MODE (Mocked) — Secure Access Link for %s: %s", email, link)
            return True

        try:
            params = {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [email],
                "subject": "Secure Access to StayVise",
                "html": f"""
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                        <h2 style="color: #025144;">StayVise</h2>
                        <p>Click the button below to sign in securely to your StayVise account. This link will expire in {settings.SECURE_ACCESS_LINK_EXPIRE_MINUTES} minutes.</p>
                        <a href="{link}" style="display: inline-block; background-color: #025144; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Access your Account</a>
                        <p style="margin-top: 20px; color: #666; font-size: 14px;">If you didn't request this link, you can safely ignore this email.</p>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #999;">StayVise — Secure Escrow for Indian Freelancers</p>
                    </div>
                """,
            }
            result = resend.Emails.send(params)
            logger.info("Secure access link email sent to %s. Resend ID: %s", email, result.get("id"))
            return True
        except Exception as exc:
            # Handle Resend Sandbox restriction specifically to avoid confusion
            if "testing emails to your own email address" in str(exc):
                logger.warning("RESEND SANDBOX RESTRICTION: Attempted to send to %s, but Resend only allows %s in testing mode.", email, settings.ADMIN_EMAILS[0])
                logger.info("FALLBACK (Mocked) — Link for %s: %s", email, link)
                return True
            
            logger.error("Failed to send secure access link email to %s. Error: %s", email, str(exc))
            raise

secure_access_service = SecureAccessService()
