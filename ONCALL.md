# StayVise Production On-Call Manual

## 🚨 P0 Contact Information
- **Lead Engineer**: Anurag (dr.anuragkr@gmail.com)
- **Escalation**: WhatsApp Business Support (via Meta Dashboard)
- **Infrastructure**: Railway Support (Priority Ticket)

## 🛠 Dashboard & Observability
- **Logs**: Railway Project Dashboard → View Logs
- **Monitoring**: Sentry Dashboard (StayVise Project)
- **Payments**: Razorpay Dashboard (Live Mode)
- **Database**: Railway PostgreSQL Metrics

## 🔄 Rollback Procedures

### 1. Backend Rollback
To roll back the backend to the previous stable version:
```bash
railway rollback --service stayvise-backend
```
*Verify with: `railway status`*

### 2. Frontend Rollback
To roll back the frontend:
```bash
railway rollback --service stayvise-frontend
```

### 3. Database Migration Rollback (CAUTION)
If a migration caused issues but didn't corrupt data:
```bash
cd backend
alembic downgrade -1
```
> [!CAUTION]
> Downgrading migrations that drop columns can result in permanent data loss. Always verify with a backup first.

## 📈 Recovery Steps
1. **API Outage**: Check Redis health. If OOM, flush `stayvise-redis`.
2. **WhatsApp Bot Failure**: Verify `WHATSAPP_ACCESS_TOKEN` is not expired. Check Meta App status.
3. **Payment Webhook Lag**: Check Celery worker logs. Ensure `razorpay` queue is not backed up.
