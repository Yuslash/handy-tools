from pydantic import BaseModel
from typing import Optional

class UrlRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: str
    output_dir: Optional[str] = None
    audio_only: bool = False
