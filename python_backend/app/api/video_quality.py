from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from app.core.video_quality import analyze_video

router = APIRouter()

class QualityCheckRequest(BaseModel):
    file_path: str

@router.post("/check_quality")
async def check_quality(request: QualityCheckRequest):
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        result = analyze_video(request.file_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
