
import logging
from fastapi import APIRouter, Depends
from app.core.deps import DbSession
from app.db.models import PublicSubmission
from app.schemas.public import SubmissionCreate, PublicSubmissionResponse

logger = logging.getLogger("stayvise.public")
router = APIRouter()

@router.post("/submit", response_model=PublicSubmissionResponse)
async def submit_public_form(
    body: SubmissionCreate,
    db: DbSession,
):
    """
    Handle public form submissions (Contact Us, Careers, etc.)
    No auth required.
    """
    submission = PublicSubmission(
        submission_type=body.submission_type,
        payload=body.payload
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    
    logger.info(f"New public submission: {submission.id} (type: {submission.submission_type})")
    
    return submission
