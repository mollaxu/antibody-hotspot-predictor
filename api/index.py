import sys
import os

# Add the project root to the Python path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.services.scanner import scan_sequence


class ScanRequest(BaseModel):
    sequence: str


app = FastAPI(title="Antibody Hotspot Predictor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/scan")
def scan(req: ScanRequest):
    result = scan_sequence(req.sequence)
    return result


@app.get("/api/health")
def health():
    return {"status": "ok"}
