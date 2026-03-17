import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from services.scanner import scan_sequence, HOTSPOT_RULES

ESMFOLD_URL = "https://api.esmatlas.com/foldSequence/v1/pdb/"


from typing import Optional, List, Dict

class ExtraRule(BaseModel):
  group: str
  motif: str
  pattern: str
  risk: str

class ScanRequest(BaseModel):
  sequence: str
  pdb_text: Optional[str] = None
  disabled_rules: Optional[List[str]] = None       # rule_name 列表，跳过这些规则
  risk_overrides: Optional[Dict[str, str]] = None   # {rule_name: "High"/"Medium"/"Low"}
  extra_rules: Optional[List[ExtraRule]] = None     # 用户自定义新增规则


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


@app.get("/rules")
def get_rules():
  """返回默认扫描规则表（供前端渲染自定义配置面板）。"""
  return [
    {"rule_name": r["rule_name"], "group": r["group"], "motif": r["motif"], "risk": r["risk"]}
    for r in HOTSPOT_RULES
  ]


@app.post("/scan")
def scan(req: ScanRequest):
  extra = None
  if req.extra_rules:
    extra = [r.model_dump() for r in req.extra_rules]
  result = scan_sequence(
    req.sequence,
    pdb_text=req.pdb_text,
    disabled_rules=req.disabled_rules,
    risk_overrides=req.risk_overrides,
    extra_rules=extra,
  )
  return result


@app.post("/fold")
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


@app.get("/health")
def health():
  return {"status": "ok"}
