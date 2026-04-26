# Messaging API Setup Guide for StayVise

To activate the Messenger OTP and Chatbot service, follow these steps to configure your Meta Developer account.

## 1. Create a Meta App
1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Click **My Apps** → **Create App**.
3. Select **Other** → **Business**.
4. Give your app a name (e.g., `StayVise-Prod`).

## 2. Add Messaging to your App
1. Inside your app dashboard, scroll to "Add products to your app".
2. Find **WhatsApp** and click **Set up**.
3. Select or create a **Meta Business Account**.

## 3. Get API Credentials
From the Messenger navigation menu:
1. Go to **API Setup**.
2. **Phone Number ID**: Copy the ID and add it to your `.env` as `MESSAGING_PHONE_NUMBER_ID`.
3. **Access Token**: Generate a temporary token for testing or create a **Permanent System User Token** in Business Settings. Add it to `.env` as `MESSAGING_ACCESS_TOKEN`.

## 4. Configure Webhooks
1. In the Messenger menu, go to **Configuration**.
2. Click **Edit** next to "Webhook":
   - **Callback URL**: `https://your-domain.com/api/v1/webhook/messenger`
   - **Verify Token**: Create a random secret string (e.g., `stay_visa_secret_123`) and add it to `.env` as `MESSAGING_VERIFY_TOKEN`.
3. Click **Verify and Save**.
4. Under **Webhook fields**, click **Manage** and subscribe to:
   - `messages` (Essential for the chatbot)

## 5. Register Message Templates
You must create and get approval for the `otp_message` template in the **Messaging Manager** (Business Suite).
- **Template Name**: `otp_message`
- **Category**: Authentication
- **Body**: `{{1}} is your StayVise verification code. For security, do not share this code.`

## 6. Environment Variables Checklist
Update your `.env` file with the following:
```bash
MESSAGING_ACCESS_TOKEN="your_token"
MESSAGING_PHONE_NUMBER_ID="your_id"
MESSAGING_VERIFY_TOKEN="your_verify_token"
ENVIRONMENT="production" # Or "staging" to enable real messaging sending
```

> [!TIP]
> Use **ngrok** during development to expose your local server (`ngrok http 8000`) and use that URL for the Webhook Callback.
