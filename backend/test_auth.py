import asyncio
from app.core.security import create_secure_access_token, decode_token
from app.core.config import settings

token = create_secure_access_token("test@example.com")
print("Token:", token)
payload = decode_token(token, expected_type="secure_access")
print("Payload:", payload)
