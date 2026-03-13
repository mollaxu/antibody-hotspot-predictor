from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.scanner import scan_sequence


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


@app.post("/scan")
def scan(req: ScanRequest):
  result = scan_sequence(req.sequence)
  return result


@app.get("/health")
def health():
  return {"status": "ok"}

