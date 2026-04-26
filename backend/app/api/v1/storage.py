import logging
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.deps import CurrentUser
from app.core.validators import validate_file_upload

logger = logging.getLogger("stayvise.storage")
router = APIRouter()

@router.post("/upload-evidence", status_code=201)
async def upload_evidence(
    user: CurrentUser,
    files: List[UploadFile] = File(...)
):
    """
    Upload dispute evidence.
    Limits: max 3 files, 5MB each, JPEG/PNG/PDF only.
    """
    if len(files) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 files allowed.")

    results = []
    for file in files:
        # 1. Size check (we read it once to check size)
        content = await file.read()
        size = len(content)
        await file.seek(0) # reset for further processing if needed
        
        # 2. Validation
        from app.core.exceptions import ValidationError
        try:
            validate_file_upload(
                filename=file.filename or "unknown",
                content_type=file.content_type or "application/octet-stream",
                size=size
            )
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        
        # 3. Handle upload (placeholder for S3/local)
        # file_url = await s3_upload(content, file.filename)
        logger.info("Validated file %s (%d bytes) from user %s", file.filename, size, user.id)
        results.append({"filename": file.filename, "url": f"https://storage.stayvise.com/mock/{file.filename}"})

    return {"files": results}
