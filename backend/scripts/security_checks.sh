#!/bin/bash
# StayVise Security Audit Checks

echo "Starting StayVise Security Audit..."
echo "----------------------------------"

# 1. Check for sensitive keywords in code
echo "[1/4] Scanning for hardcoded secrets..."
grep -rn "sk_live\|rzp_live\|" backend/app/ | grep -v "settings."
if [ $? -eq 0 ]; then
    echo "❌ WARNING: Potential hardcoded secrets found!"
else
    echo "✅ No hardcoded secrets found."
fi

# 2. Check SECRET_KEY length in .env
echo "[2/4] Verifying SECRET_KEY strength..."
if [ -f backend/.env ]; then
    SECRET_LEN=$(grep "SECRET_KEY" backend/.env | cut -d'=' -f2 | tr -d ' "' | wc -c)
    if [ $SECRET_LEN -lt 32 ]; then
        echo "❌ ERROR: SECRET_KEY is too short ($SECRET_LEN bytes). Must be >= 32."
    else
        echo "✅ SECRET_KEY length is sufficient."
    fi
else
    echo "⚠️ .env file not found, skipping length check."
fi

# 3. Run Dependency Audit
echo "[3/4] Running pip-audit..."
# Use uv or pip to run audit if available, else skip
if command -v pip-audit &> /dev/null; then
    pip-audit
else
    echo "⚠️ pip-audit not installed. Run 'pip install pip-audit' to enable."
fi

# 4. Check for debug mode in production config
echo "[4/4] Verifying production config safety..."
grep "DEBUG=True" backend/app/core/config.py
if [ $? -eq 0 ]; then
    echo "❌ WARNING: DEBUG mode might be hardcoded to True!"
else
    echo "✅ DEBUG mode check passed."
fi

echo "----------------------------------"
echo "Security Audit Complete."
