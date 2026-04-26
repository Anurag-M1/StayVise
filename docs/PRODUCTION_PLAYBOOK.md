# StayVise — Messaging Production Playbook

This document provides the definitive steps to transition StayVise from a development trial to a fully operational production environment.

## 1. Meta Infrastructure & Portfolio

Production messaging services require a **Verified Business Portfolio**.

### A. Business Verification
1. Go to **[Business Settings](https://business.facebook.com/settings/)**.
2. Navigate to **Security Center**.
3. Click "Start Verification" and provide legal business documentation.
4. *Why?* This removes the "Trial Mode" limit (250 messages/day) and allows you to initiate conversations with customers.

### B. Display Name Approval
1. In the **Meta Messaging Manager**, click on the phone number you added.
2. Ensure the "Display Name" matches your legal business name or branding (StayVise).
3. Meta will review this; messages sent with an unapproved display name may be flagged.

---

## 2. Email Infrastructure (Resend)

StayVise uses **Resend** for Magic Link authentication. Production requires a verified domain to send emails to clients and freelancers.

### A. Domain Verification
1. Log in to [Resend.com](https://resend.com/domains).
2. Click **"Add Domain"** and enter your production domain (e.g., `stayvise.in`).
3. Add the provided **MX, TXT, and CNAME** records to your domain's DNS settings (at GoDaddy, Namecheap, etc.).
4. Wait for the status to change to **"Verified"**.

### B. Production Credentials
1. Generate a **Production API Key** in Resend.
2. Add it to your `.env` as `RESEND_API_KEY`.
3. Update `RESEND_FROM_EMAIL` to use your verified domain:
   - Example: `StayVise <no-reply@stayvise.in>`

### C. Rate Limits
Ensure your Resend "Sending Limit" is sufficient. New accounts start with a daily limit that increases as you send more healthy traffic.

---

## 3. Security Hardening

### A. Webhook HMAC Verification
The backend now implements **HMAC SHA256** verification.
1. Go to **Meta for Developers** → **App Settings** → **Basic**.
2. Locate your **App Secret**.
3. Add it to your production `.env` as `WHATSAPP_APP_SECRET`.
4. *Verification*: Any POST request to `/api/v1/webhook/messenger` that doesn't have a valid `X-Hub-Signature-256` header will now be rejected with a `403 Forbidden` error.

### B. System User Tokens
Never use "Temporary Access Tokens" in production.
1. Create a **System User** (Role: Admin) in Business Settings.
2. Generate a token for the user, selecting the **StayVise App**.
3. Check `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Copy this token—it never expires until revoked.

---

## 3. Operations & Conversations

### A. The 24-Hour Window
StayVise Messenger uses a "Service Window".
- If the user messages you, you have 24 hours to respond with free-form text.
- If you message the user *outside* this window, you **MUST** use a pre-approved Template.
- Our chatbot handles state persistent in Redis to ensure it knows where it left off.

### B. Template Mapping
Ensure the following templates are approved and match the keys in our code:
| Feature | Template Key | Components |
| :--- | :--- | :--- |
| Auth | `otp_message` | `{{1}}` (6-digit code) |
| Milestones | `milestone_review` | Buttons for Approve/Dispute |
| Onboarding | `welcome_onboarding` | Header with Logo |

---

## 4. Backend Deployment Checklist

### A. Environment Variables (`.env`)
```bash
ENVIRONMENT="production"
DEBUG="False"
MESSAGING_APP_SECRET="your_apps_secret"
MESSAGING_ACCESS_TOKEN="your_permanent_system_token"
MESSAGING_PHONE_NUMBER_ID="your_real_phone_id"
MESSAGING_VERIFY_TOKEN="your_webhook_verify_string"
```

### B. Redis Cluster
Ensure Redis is configured with `appendonly yes`. If Redis crashes and loses session data, active chatbot conversations will be reset to `IDLE`.

### C. SSL / TLS
Meta **requires** an `https` endpoint for webhooks. Ensure your production load balancer (Nginx, Caddy, or Cloudflare) has a valid SSL certificate.

---

## 5. Troubleshooting in Production
1. **Webhook failures**: Check the Meta "Webhook" tab. It shows the history of failed delivery attempts.
2. **"Message not sent"**: Check the `Transaction History` in Messaging Manager to see if the message was rejected due to "Account Health" or "Low Quality".
3. **Logs**: Filter backend logs for `stayvise.webhook` to see rejected signatures or parsing errors.
