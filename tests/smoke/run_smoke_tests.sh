#!/bin/bash
# StayVise — Smoke Test Runner
# Usage: ./run_smoke_tests.sh <BASE_URL>

BASE=${1:-"https://staging.stayvise.in"}
FAIL=0

echo "🚀 Starting smoke tests against $BASE..."

check() {
  local desc=$1; local url=$2; local expected=$3
  echo -n "🔍 $desc... "
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" != "$expected" ]; then
    echo "❌ FAIL (got $code, expected $expected)"
    FAIL=1
  else
    echo "✅ PASS"
  fi
}

# 1. Backend Connectivity
check "Health endpoint" "$BASE/health" "200"
check "Auth OTP endpoint (method check)" "$BASE/api/v1/auth/send-otp" "405" # POST expected, so GET should be 405

# 2. Public Access
check "Public profile 404 for unknown" "$BASE/api/v1/users/unknown/profile" "404"
check "Webhook GET verification (auth check)" "$BASE/api/v1/webhook/whatsapp?hub.verify_token=wrong" "403"

# 3. Security Check
check "Admin blocked for anonymous" "$BASE/api/v1/admin/users" "401"

# 4. Frontend Checks (If BASE is the backend, we might need a FRONTEND_URL but often they are same or proxied)
# Note: The CI script passes the backend URL. If the frontend is on a different domain, 
# we should ideally pass it as a second arg. 
# For now, we assume the provided BASE is where the API lives.

if [ $FAIL -eq 0 ]; then
  echo "✨ All smoke tests PASSED"
  exit 0
else
  echo "🛑 SMOKE TESTS FAILED"
  exit 1
fi
