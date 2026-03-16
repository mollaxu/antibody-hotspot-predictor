import re

# ═══════════════════════════════════════════════════════════════
# PTM Hotspot 扫描规则库（基于 PRD 附录规则表）
# group 字段需与前端 groupOrder 完全一致
# ═══════════════════════════════════════════════════════════════
HOTSPOT_RULES = [
    # 1. 脱酰胺
    {"group": "1. 脱酰胺", "rule_name": "脱酰胺-NG",      "motif": "NG",      "regex": "NG",      "pattern": r"NG",      "risk": "High",   "category": "化学稳定性"},
    {"group": "1. 脱酰胺", "rule_name": "脱酰胺-N[STHN]",  "motif": "N[STHN]", "regex": "N[STHN]", "pattern": r"N[STHN]", "risk": "Medium", "category": "化学稳定性"},
    {"group": "1. 脱酰胺", "rule_name": "脱酰胺-N[AEV]",   "motif": "N[AEV]",  "regex": "N[AEV]",  "pattern": r"N[AEV]",  "risk": "Low",    "category": "化学稳定性"},
    # 2. 氧化
    {"group": "2. 氧化",   "rule_name": "氧化-Met",        "motif": "M",       "regex": "M",       "pattern": r"M",       "risk": "Medium", "category": "化学稳定性"},
    {"group": "2. 氧化",   "rule_name": "氧化-Trp",        "motif": "W",       "regex": "W",       "pattern": r"W",       "risk": "Medium", "category": "化学稳定性"},
    {"group": "2. 氧化",   "rule_name": "氧化-His/Cys",    "motif": "[HC]",    "regex": "[HC]",    "pattern": r"[HC]",    "risk": "Low",    "category": "化学稳定性"},
    # 3. 异构化
    {"group": "3. 异构化",  "rule_name": "异构化-DG",       "motif": "DG",      "regex": "DG",      "pattern": r"DG",      "risk": "High",   "category": "化学稳定性"},
    {"group": "3. 异构化",  "rule_name": "异构化-D[STHD]",  "motif": "D[STHD]", "regex": "D[STHD]", "pattern": r"D[STHD]", "risk": "Medium", "category": "化学稳定性"},
    # 4. 糖基化
    {"group": "4. 糖基化",  "rule_name": "N-糖基化",        "motif": "N-X-S/T", "regex": "N[^P][ST]","pattern": r"N[^P][ST]","risk": "High",  "category": "安全性风险"},
    {"group": "4. 糖基化",  "rule_name": "O-糖基化",        "motif": "[ST]",    "regex": "[ST]",    "pattern": r"[ST]",    "risk": "Medium", "category": "安全性风险"},
    # 5. 游离巯基
    {"group": "5. 游离巯基", "rule_name": "游离巯基-Cys",    "motif": "C",       "regex": "C",       "pattern": r"C",       "risk": "High",   "category": "安全性风险"},
    # 6. 细胞粘附
    {"group": "6. 细胞粘附", "rule_name": "细胞粘附-RGD/LDV/KGD","motif": "RGD|LDV|KGD","regex": "RGD|LDV|KGD","pattern": r"(?:RGD|LDV|KGD)","risk": "Medium","category": "安全性风险"},
    # 7. 裂解
    {"group": "7. 裂解",    "rule_name": "裂解-DP",         "motif": "DP",      "regex": "DP",      "pattern": r"DP",      "risk": "Medium", "category": "结构完整性"},
    {"group": "7. 裂解",    "rule_name": "裂解-DK/EA/TS",   "motif": "DK|EA|TS","regex": "DK|EA|TS","pattern": r"(?:DK|EA|TS)","risk": "Low","category": "结构完整性"},
    # 8. 蛋白水解
    {"group": "8. 蛋白水解", "rule_name": "蛋白水解-TS/NP",  "motif": "TS|NP",   "regex": "TS|NP",   "pattern": r"(?:TS|NP)","risk": "Low",   "category": "其他风险"},
    # 9. 环化
    {"group": "9. 环化",    "rule_name": "环化-N端Q/E",     "motif": "^[QE]",   "regex": "^[QE]",   "pattern": r"^[QE]",   "risk": "Low",    "category": "其他风险"},
    # 10. 糖基化终产物
    {"group": "10. 糖基化终产物","rule_name": "糖基化终产物-Lys","motif": "K",    "regex": "K",       "pattern": r"K",       "risk": "Low",    "category": "其他风险"},
]

# RSA 尚未接入 FreeSASA，使用 mock 值
MOCK_RSA = 0.5


# ═══════════════════════════════════════════════════════════════
# 蛋白类型识别
# ═══════════════════════════════════════════════════════════════

# 抗体可变区特征正则：
#   C...W...C 框架保守半胱氨酸-色氨酸-半胱氨酸骨架 (FR1-CDR1-FR2 区间)
_AB_FRAMEWORK_RE = re.compile(r"C.{8,40}W.{20,60}C")
#   重链 J 区标志 WGXG / FGXG（FR4 区特征）
_AB_JH_RE = re.compile(r"[WF]G.G")


def identify_protein_type(sequence: str) -> str:
    """根据序列特征判断蛋白类型。

    Returns:
        "Antibody"        – 识别到抗体可变区框架特征
        "Peptide"         – 长度 < 50 的短肽
        "General Protein" – 其他蛋白 / 酶
    """
    if len(sequence) < 50:
        return "Peptide"

    # 同时满足框架骨架和 J 区标志 → 高置信度抗体
    has_framework = bool(_AB_FRAMEWORK_RE.search(sequence))
    has_j_motif = bool(_AB_JH_RE.search(sequence))

    if has_framework and has_j_motif:
        return "Antibody"

    # 仅框架骨架命中（可能是单域抗体 / VHH）也视为抗体
    if has_framework:
        return "Antibody"

    return "General Protein"


# ═══════════════════════════════════════════════════════════════
# 抗体 IMGT 近似区域划分（0-based）
# ═══════════════════════════════════════════════════════════════

REGION_MAP_HEAVY = [
    (0,   25,  "FR1"),
    (25,  35,  "CDR1"),
    (35,  49,  "FR2"),
    (49,  65,  "CDR2"),
    (65,  94,  "FR3"),
    (94,  102, "CDR3"),
    (102, 120, "FR4"),
]

VARIABLE_REGION_END = 120


def _assign_region_antibody(pos: int, seq_len: int) -> str:
    """抗体序列：根据 Kabat 近似位置分配 CDR / FR / Fc 区域。"""
    if pos >= VARIABLE_REGION_END:
        return "Fc"
    for start, end, label in REGION_MAP_HEAVY:
        if start <= pos < end:
            return label
    return "FR"


# ═══════════════════════════════════════════════════════════════
# 主扫描函数
# ═══════════════════════════════════════════════════════════════

def scan_sequence(sequence: str) -> dict:
    """扫描序列，返回所有命中的 PTM hotspot 位点。"""
    sequence = sequence.strip().upper()
    seq_len = len(sequence)

    # 1. 识别蛋白类型
    protein_type = identify_protein_type(sequence)
    is_antibody = protein_type == "Antibody"

    # 2. 扫描 hotspot
    hotspots = []
    for rule in HOTSPOT_RULES:
        for match in re.finditer(rule["pattern"], sequence):
            base_risk = rule["risk"]

            # 区域分配：仅抗体执行 CDR/FR 划分
            if is_antibody:
                region = _assign_region_antibody(match.start(), seq_len)
            else:
                region = "N/A"

            # CDR 风险提升：仅抗体且位于 CDR 区
            final_risk = base_risk
            if is_antibody and region.startswith("CDR") and MOCK_RSA > 0.20:
                if base_risk in ("High", "Medium"):
                    final_risk = "Critical"

            hotspots.append({
                "group":      rule["group"],
                "rule_name":  rule["rule_name"],
                "motif":      match.group(),
                "regex":      rule["regex"],
                "start":      match.start(),
                "end":        match.end(),
                "region":     region,
                "base_risk":  base_risk,
                "final_risk": final_risk,
                "rsa":        MOCK_RSA,
                "category":   rule["category"],
            })

    # 3. 排序 & 去重
    risk_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    hotspots.sort(key=lambda h: (h["start"], risk_order.get(h["base_risk"], 9)))

    seen = set()
    unique = []
    for h in hotspots:
        key = (h["start"], h["group"])
        if key not in seen:
            seen.add(key)
            unique.append(h)

    return {
        "protein_type":    protein_type,
        "sequence_length": seq_len,
        "hotspots":        unique,
        "buried_filtered": [],
    }
