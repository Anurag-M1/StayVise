import re
import bleach
from decimal import Decimal
from app.core.exceptions import ValidationError

# India E.164 Validator
# Range: +91 followed by 10 digits starting with 6-9
_INDIA_PHONE_RE = re.compile(r"^\+91[6-9]\d{9}$")

def validate_indian_phone(phone: str) -> str:
    """
    Standardize and validate an Indian mobile number.
    - Strips all non-digits
    - Handles 91 prefix (removes it to get 10 digits)
    - Enforces [6-9]\d{9} regex
    - Returns in +919999999999 format
    """
    if not phone:
        raise ValidationError("Phone number is required.")

    # Strip all non-digit characters
    digits = re.sub(r"\D", "", phone)

    # If it starts with 91 and is 12 digits long, strip the 91
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    
    # Must be exactly 10 digits now
    if not re.match(r"^[6-9]\d{9}$", digits):
        raise ValidationError(
            "Invalid Indian mobile number. Must be a 10-digit number starting with 6-9."
        )

    return f"+91{digits}"


VALID_PROJECT_TRANSITIONS = {
    "draft": ["awaiting_payment", "cancelled"],
    "awaiting_payment": ["in_progress", "cancelled"],
    "in_progress": ["completed", "disputed"],
    "disputed": ["in_progress", "completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


def validate_project_transition(current: str, next_state: str) -> None:
    """Enforce strict project state machine transitions."""
    if current not in VALID_PROJECT_TRANSITIONS:
        raise ValidationError(f"Invalid current project state: {current}")
    
    if next_state not in VALID_PROJECT_TRANSITIONS[current]:
        raise ValidationError(
            f"Invalid project state transition: {current} -> {next_state}. "
            f"Allowed: {', '.join(VALID_PROJECT_TRANSITIONS[current])}"
        )


def validate_amount(v) -> Decimal:
    """
    Validate financial amounts:
    - Must be positive
    - Max ₹1 Cr (10,000,000)
    - Max 2 decimal places
    """
    try:
        if isinstance(v, (int, float)):
            v = Decimal(str(v))
        elif not isinstance(v, Decimal):
            v = Decimal(v)
    except Exception:
        raise ValidationError("Invalid amount format")

    if v <= 0:
        raise ValidationError("Amount must be positive")
    if v > Decimal("10000000"):
        raise ValidationError("Amount exceeds maximum (₹1 Cr)")
    
    # Check decimal places
    if v.as_tuple().exponent < -2:
        raise ValidationError("Max 2 decimal places allowed")
        
    return v


def sanitize_text(v: str, min_length: int = 2) -> str:
    """
    Sanitize text fields:
    - Strip all HTML tags using bleach
    - Trim whitespace
    - Enforce minimum length
    """
    if not isinstance(v, str):
        raise ValidationError("Must be a string")
        
    v = v.strip()
    # Strip ALL HTML
    v = bleach.clean(v, tags=[], strip=True)
    
    if len(v) < min_length:
        raise ValidationError(f"Text too short (min {min_length} characters)")
        
    return v


def validate_uuid_str(v: str) -> str:
    """Validate that a string is a valid UUID."""
    import uuid
    try:
        uuid.UUID(v)
        return v
    except ValueError:
        raise ValidationError(f"Invalid UUID format: {v}")


def validate_file_upload(
    filename: str, 
    content_type: str, 
    size: int, 
    max_size: int = 5 * 1024 * 1024,
    allowed_types: set[str] = None
):
    """
    Validate uploaded files:
    - Max size (default 5MB)
    - Allowed MIME types
    - Extension check
    """
    if allowed_types is None:
        allowed_types = {"image/jpeg", "image/png", "application/pdf"}

    if size > max_size:
        raise ValidationError(f"File too large. Max allowed: {max_size/1024/1024}MB")
    
    if content_type not in allowed_types:
        raise ValidationError(f"Invalid file type: {content_type}. Allowed: {', '.join(allowed_types)}")

    # Basic extension check
    ext = filename.split(".")[-1].lower() if "." in filename else ""
    if ext not in {"jpg", "jpeg", "png", "pdf"}:
        raise ValidationError("Invalid file extension. Only JPG, PNG, PDF allowed.")
    
    # ClamAV placeholder (in production this would call a sidecar)
    # logger.info("Scanned file %s with ClamAV: OK", filename)
    pass
