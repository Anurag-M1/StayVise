# StayVise — Production RUNBOOK

> **Audience**: Platform engineers, on-call responders, and founding team members.
> **Last updated**: April 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How to Roll Back a Bad Deploy](#1-how-to-roll-back-a-bad-deploy)
3. [How to Manually Release a Stuck Milestone](#2-how-to-manually-release-a-stuck-milestone)
4. [How to Add a New Messaging Template](#3-how-to-add-a-new-messaging-template)
5. [How to Investigate a Failed Payout](#4-how-to-investigate-a-failed-payout)
6. [Database Operations & Optimization](#5-database-operations)
7. [Disaster Recovery](#6-disaster-recovery)
8. [Incident Response Checklist](#7-incident-response-checklist)
9. [Pre-Launch Checklist](#8-pre-launch-checklist)

---

## Architecture Overview

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Vercel     │    │    Railway       │    │  Cloudflare  │
│  (Frontend)  │←──→│  (Backend API)   │←──→│  (DNS/CDN)   │
│  React SPA   │    │  FastAPI+Uvicorn │    │  stayvise.in│
└──────────────┘    └────────┬─────────┘    └─────────────┘
                             │
              ┌──────────────┼──────────────────┐
              │              │                  │
    ┌─────────▼────┐  ┌─────▼──────┐   ┌──────▼──────┐
    │  PostgreSQL   │  │   Redis    │   │Celery Worker│
    │  (Railway)    │  │  (Railway) │   │  + Beat     │
    └──────────────┘  └────────────┘   └─────────────┘
```

**Services on Railway:**
| Service | Process | Scaling |
|---------|---------|---------|
| `stayvise-api` | `uvicorn app.main:app` | 2 workers |
| `stayvise-worker` | `celery worker -c 2` | 1 instance |
| `stayvise-beat` | `celery beat` | 1 instance (singleton) |
| `stayvise-db` | PostgreSQL 16 | Managed by Railway |
| `stayvise-redis` | Redis 7 | Managed by Railway |

---

## 1. How to Roll Back a Bad Deploy

### Railway (Backend)

```bash
# Option A: Revert via Railway CLI
railway deploy --rollback

# Option B: Revert via Git
git revert HEAD
git push origin main
# Railway auto-deploys from main branch

# Option C: Railway Dashboard
# 1. Go to https://railway.app → Project → Deployments
# 2. Find the last known-good deployment
# 3. Click "⋮" → "Redeploy"
```

### Vercel (Frontend)

```bash
# Option A: Vercel CLI
vercel rollback

# Option B: Vercel Dashboard
# 1. Go to https://vercel.com → Project → Deployments
# 2. Click the previous deployment → "..." → "Promote to Production"
```

### Database rollback (if migration was the issue)

```bash
# SSH into Railway or use railway run:
railway run alembic downgrade -1

# To go back to a specific revision:
railway run alembic downgrade <revision_id>

# IMPORTANT: After downgrading, also rollback the code deploy
# to the version that expects the older schema.
```

### Verification after rollback

```bash
# 1. Check health
curl https://api.stayvise.in/health

# 2. Check a protected endpoint
curl -H "Authorization: Bearer $TOKEN" https://api.stayvise.in/api/v1/users/me

# 3. Check Sentry for new errors (should stop)
# 4. Check Railway logs for startup errors
```

---

## 2. How to Manually Release a Stuck Milestone

A milestone can get "stuck" when:
- Client is unresponsive after freelancer submits work
- Auto-release task failed
- Dispute was resolved but release didn't trigger

### Via Admin API

```bash
# 1. Find the project
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.stayvise.in/api/v1/admin/users/{user_id}

# 2. If disputed, resolve via admin
curl -X PUT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision": "release_freelancer", "notes": "Client unresponsive > 7 days"}' \
  https://api.stayvise.in/api/v1/admin/disputes/{project_id}/resolve
```

### Via Direct Database (last resort)

```sql
-- Connect to Railway PostgreSQL
-- 1. Find the stuck milestone
SELECT m.id, m.title, m.status, m.amount, p.title as project_title
FROM milestones m
JOIN projects p ON m.project_id = p.id
WHERE m.status IN ('submitted', 'approved')
  AND m.submitted_at < NOW() - INTERVAL '7 days';

-- 2. Release the milestone
UPDATE milestones
SET status = 'released', released_at = NOW()
WHERE id = '<milestone_id>';

-- 3. Update project status if all milestones released
UPDATE projects
SET status = 'completed', updated_at = NOW()
WHERE id = '<project_id>'
  AND NOT EXISTS (
    SELECT 1 FROM milestones
    WHERE project_id = '<project_id>'
      AND status != 'released'
  );

-- 4. Trigger payout manually (run from app console)
-- railway run python -c "
-- from app.services.payment import payment_service
-- import asyncio; asyncio.run(payment_service.process_payout('<milestone_id>', db))
-- "
```

### Post-release verification

1. Check the freelancer received the payout in Razorpay Dashboard
2. Recalculate trust scores for both parties:
```bash
# Trigger via Celery
railway run python -c "
from app.tasks.trust_tasks import recalculate_user_trust_score
recalculate_user_trust_score.delay('<freelancer_id>')
recalculate_user_trust_score.delay('<client_id>')
"
```

---

## 3. How to Add a New Messaging Template

### Step 1: Design the template

Templates have a strict format:
```
Name: project_reminder (lowercase, underscores only)
Category: UTILITY (not MARKETING for transactional messages)
Language: en

Header: (optional) Text/Image/Document
Body: "Hi {{1}}, your project {{2}} has a milestone due in {{3}} days."
Footer: (optional) "StayVise Escrow"
Buttons: (optional) Quick Reply or URL buttons
```

### Step 2: Submit for Meta approval

1. Go to **Meta Business Suite** → **WhatsApp Manager** → **Message Templates**
2. Click **Create Template**
3. Fill in the template details
4. Submit for review (takes 1-24 hours)

### Step 3: Add to codebase

```python
# In app/services/messaging.py, add a new helper method:

async def send_project_reminder(self, phone: str, name: str, project: str, days: int) -> dict:
    """Send project reminder using approved template."""
    return await self.send_template_message(
        phone=phone,
        template_name="project_reminder",
        components=[
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": name},
                    {"type": "text", "text": project},
                    {"type": "text", "text": str(days)},
                ]
            }
        ]
    )
```

### Step 4: Test

```bash
# In development (ENVIRONMENT=development), templates are sent as plain text
# In production, verify in Messaging API logs
curl -X POST https://api.stayvise.in/api/v1/test/send-template \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"phone": "+91YOUR_NUMBER", "template": "project_reminder"}'
```

### Currently registered templates

| Template Name | Purpose | Status |
|--------------|---------|--------|
| `project_invite` | Invite client to fund escrow | Pending |
| `milestone_submitted` | Notify client of submission | Pending |
| `milestone_approved` | Notify freelancer of approval | Pending |
| `payment_received` | Confirm escrow funding | Pending |
| `payout_sent` | Confirm payout to freelancer | Pending |
| `dispute_opened` | Alert both parties | Pending |

---

## 4. How to Investigate a Failed Payout

### Step 1: Find the failure

```bash
# Check Sentry for payout errors
# Filter by: logger = "stayvise.payment_audit"

# Or check Railway logs
railway logs --filter "payout" --lines 100
```

### Step 2: Check Razorpay Dashboard

1. Go to **Razorpay Dashboard** → **RazorpayX** → **Payouts**
2. Search by payout ID or contact ID
3. Common failure reasons:
   - `INSUFFICIENT_FUNDS` — Top up the RazorpayX account
   - `BENEFICIARY_BANK_ISSUE` — Bank rejected; ask freelancer to verify details
   - `INVALID_VPA` — UPI ID is wrong

### Step 3: Diagnose in database

```sql
-- Find failed transactions
SELECT t.*, p.title as project_title, u.full_name as freelancer_name
FROM transactions t
JOIN projects p ON t.project_id = p.id
JOIN users u ON u.id = p.freelancer_id
WHERE t.transaction_type = 'payout'
  AND t.status = 'failed'
ORDER BY t.created_at DESC
LIMIT 20;

-- Check the milestone state
SELECT m.*, p.status as project_status
FROM milestones m
JOIN projects p ON m.project_id = p.id
WHERE m.razorpay_payout_id IS NOT NULL
  AND m.status = 'approved'; -- Should be 'released' if payout succeeded
```

### Step 4: Retry the payout

```bash
# Option A: Retry via API (if freelancer has fixed their bank details)
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.stayvise.in/api/v1/payments/retry-payout/{milestone_id}

# Option B: Manual payout via Razorpay Dashboard
# 1. Go to RazorpayX → Payouts → Create Payout
# 2. Use the freelancer's fund_account_id
# 3. After successful payout, update DB:
```

```sql
UPDATE milestones
SET status = 'released',
    released_at = NOW(),
    razorpay_payout_id = '<new_payout_id>'
WHERE id = '<milestone_id>';
```

### Step 5: Notify the freelancer

Send an official notification confirming the payout was retried and succeeded.

---

## 5. Database Operations

### Weekly backup verification

A Celery task runs every Sunday at 4 AM IST to verify the latest backup by restoring it to a temporary instance and checking row counts.
- Task: `tasks.verify_backup_integrity`
- Results: Sent to admin via Messenger system alert.

### PostgreSQL Production Settings (Railway)

In the Railway "Variables" tab for the Postgres service, ensure the following are set (or included in a custom `postgresql.conf` if enabled):

| Parameter | Recommended Value |
|-----------|-------------------|
| `max_connections` | 100 |
| `shared_buffers` | 256MB |
| `effective_cache_size` | 768MB |
| `maintenance_work_mem` | 64MB |
| `checkpoint_completion_target` | 0.9 |
| `wal_buffers` | 16MB |
| `default_statistics_target`| 100 |
| `random_page_cost` | 1.1 |
| `effective_io_concurrency` | 200 |
| `work_mem` | 4MB |
| `min_wal_size` | 1GB |
| `max_wal_size` | 4GB |

**Session Timeouts (Applied by App):**
- `statement_timeout`: 30s
- `idle_in_transaction_session_timeout`: 60s

---

## 6. Disaster Recovery

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: < 2 hours
- **RPO (Recovery Point Objective)**: < 15 minutes

### SCENARIO: Production DB unresponsive

1.  **Check Railway Dashboard**: Is the Postgres service status green?
2.  **Service Crashed?**: Railway auto-restarts services in < 2min. Monitor logs for `OOM` or disk space errors.
3.  **Data Corruption?**:
    -   Restore from latest verified backup (see [Database Operations](#5-database-operations)).
    -   Replay WAL logs from the point of last backup (if continuous archiving is enabled).
4.  **Verify Integrity**:
    -   Run row counts comparison (Prod vs Backup).
    -   Verify key indices are valid (`REINDEX` if necessary).
5.  **Reconnect traffic**: Switch API service to new DB instance, monitor error rates in Sentry for 15 minutes.

---

---

## 6. Incident Response Checklist

### Severity 1: Payments broken / data loss

1. [ ] Acknowledge in team Slack channel
2. [ ] Check Sentry for error spike
3. [ ] Check Railway health: `curl https://api.stayvise.in/health`
4. [ ] Check Razorpay status page: https://status.razorpay.com
5. [ ] If our fault → roll back deploy immediately
6. [ ] If Razorpay outage → enable "maintenance mode" message
7. [ ] Post-incident: write RCA within 24 hours

### Severity 2: Feature broken but payments working

1. [ ] Check Railway logs: `railway logs --lines 200`
2. [ ] Check if it's a database migration issue
3. [ ] Fix forward if trivial, rollback if complex
4. [ ] Notify affected users via WhatsApp

### Severity 3: Performance degradation

1. [ ] Check Railway metrics (CPU, memory)
2. [ ] Check PostgreSQL slow query log
3. [ ] Check Redis memory usage
4. [ ] Scale workers if needed: Railway dashboard → service → scale

---

## 7. Pre-Launch Checklist

### Infrastructure
- [ ] Railway PostgreSQL provisioned and `alembic upgrade head` ran
- [ ] Railway Redis provisioned
- [ ] Celery worker service running
- [ ] Celery beat service running (exactly 1 instance)
- [ ] `/health` returns 200

### External Services
- [ ] Razorpay **production** API keys configured (not test!)
- [ ] Razorpay webhooks configured:
  - `payment.captured`
  - `payment.failed`
  - `payout.processed`
  - `payout.failed`
  - `payout.reversed`
- [ ] Official Messaging API connected
- [ ] All 6 messaging templates approved in Meta Business Manager
- [ ] `MESSAGING_VERIFY_TOKEN` set and webhook verified

### Security
- [ ] `SECRET_KEY` is a unique 64+ character random string
- [ ] `SENTRY_DSN` configured
- [ ] Rate limiting verified under load test
- [ ] CORS configured for `https://stayvise.in` only
- [ ] API docs disabled in production (`/docs` returns 404)

### DNS & SSL
- [ ] `stayvise.in` pointed to Vercel (frontend)
- [ ] `api.stayvise.in` pointed to Railway (backend)
- [ ] Cloudflare SSL set to "Full (strict)"
- [ ] HSTS enabled in Cloudflare

### Smoke Test
```bash
# 1. Health check
curl https://api.stayvise.in/health
# Expected: {"status": "healthy", ...}

# 2. Send OTP
curl -X POST https://api.stayvise.in/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+91XXXXXXXXXX"}'
# Expected: {"message": "OTP sent", "expires_in": 600}

# 3. Visit public profile
curl https://api.stayvise.in/api/v1/users/{test_user_id}/profile
# Expected: Public profile JSON

# 4. Frontend loads
curl -I https://stayvise.in
# Expected: 200 OK with security headers
```

---

## Environment Variables Reference

| Variable | Example | Where |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | Railway (auto) |
| `REDIS_URL` | `redis://...` | Railway (auto) |
| `SECRET_KEY` | `<64-char random>` | Railway env |
| `ENVIRONMENT` | `production` | Railway env |
| `FRONTEND_URL` | `https://stayvise.in` | Railway env |
| `ALLOWED_ORIGINS` | `https://stayvise.in` | Railway env |
| `RAZORPAY_KEY_ID` | `rzp_live_...` | Railway env |
| `RAZORPAY_KEY_SECRET` | `...` | Railway env |
| `RAZORPAY_WEBHOOK_SECRET` | `...` | Railway env |
| `RAZORPAY_ACCOUNT_NUMBER` | `...` | Railway env |
| `MESSAGING_ACCESS_TOKEN` | `EAA...` | Railway env |
| `MESSAGING_PHONE_NUMBER_ID` | `1234...` | Railway env |
| `MESSAGING_VERIFY_TOKEN` | `<custom>` | Railway env |
| `SENTRY_DSN` | `https://...@sentry.io/...` | Railway env |
| `VITE_API_URL` | `https://api.stayvise.in/api/v1` | Vercel env |
