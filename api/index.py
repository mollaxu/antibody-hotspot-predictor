import sys
import os

# Add the project root to the Python path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from typing import Optional
from backend.services.scanner import scan_sequence

ESMFOLD_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"


class ScanRequest(BaseModel):
    sequence: str
    pdb_text: Optional[str] = None


class FoldRequest(BaseModel):
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
    result = scan_sequence(req.sequence, pdb_text=req.pdb_text)
    return result


@app.post("/api/fold")
async def fold(req: FoldRequest):
    """代理 ESMFold API，避免浏览器 CORS 限制。"""
    import re as _re
    # ESMFold 允许的氨基酸字母集合
    ALLOWED = set("ACDEFGHIKLMNPQRSTVWYBXZJ")
    seq = _re.sub(r'[^A-Za-z]', '', req.sequence).upper()
    if not seq:
        raise HTTPException(status_code=422, detail="序列为空或不包含有效氨基酸字母。")
    # 过滤非标准残基（如 O、U）
    warning = ""
    invalid = sorted(set(seq) - ALLOWED)
    if invalid:
        seq = ''.join(c for c in seq if c in ALLOWED)
        if not seq:
            raise HTTPException(status_code=422, detail=f"序列中仅含非标准残基: {', '.join(invalid)}")
        warning = f"序列中含有非标准残基 [{', '.join(invalid)}]，已自动过滤"
    if len(seq) > 400:
        raise HTTPException(status_code=422, detail="序列超过 400 残基，ESMFold 暂不支持。")

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            ESMFOLD_URL,
            content=seq,
            headers={"Content-Type": "text/plain"},
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ESMFold 返回错误 [HTTP {resp.status_code}]",
        )

    return {"pdb": resp.text, "warning": warning}


@app.get("/api/health")
def health():
    return {"status": "ok"}
