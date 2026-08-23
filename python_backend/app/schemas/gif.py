from pydantic import BaseModel
from typing import Optional

class GifRequest(BaseModel):
    file_path: str
    start_time: Optional[str] = None # "MM:SS" or "SS"
    end_time: Optional[str] = None   # "MM:SS" or "SS"
    fps: int = 15
    width: int = 480
    output_path: Optional[str] = None
    high_quality: bool = True
