import re
import io
import warnings

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

# 标准氨基酸最大 ASA 参考值 (Å², Tien et al. 2013, 理论最大值)
# 用于将绝对 SASA 转换为相对 RSA (0-1)
MAX_ASA = {
    'A': 129.0, 'R': 274.0, 'N': 195.0, 'D': 193.0, 'C': 167.0,
    'E': 223.0, 'Q': 225.0, 'G': 104.0, 'H': 224.0, 'I': 197.0,
    'L': 201.0, 'K': 236.0, 'M': 224.0, 'F': 240.0, 'P': 159.0,
    'S': 155.0, 'T': 172.0, 'W': 285.0, 'Y': 263.0, 'V': 174.0,
}


# ═══════════════════════════════════════════════════════════════
# RSA 计算（BioPython ShrakeRupley）
# ═══════════════════════════════════════════════════════════════

def compute_rsa_from_pdb(pdb_text: str) -> dict:
    """从 PDB 文本计算每个残基的 RSA。

    Returns:
        dict: {(chain_id, res_seq_int): rsa_float} ，rsa 范围 0-1
        如果计算失败返回空 dict
    """
    try:
        from Bio.PDB import PDBParser, ShrakeRupley
    except ImportError:
        return {}

    try:
        warnings.filterwarnings('ignore')
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure('protein', io.StringIO(pdb_text))
        sr = ShrakeRupley()
        sr.compute(structure, level='R')

        rsa_map = {}
        for model in structure:
            for chain in model:
                for residue in chain:
                    res_name = residue.get_resname().strip()
                    res_id = residue.get_id()
                    # 跳过 hetero 残基（水分子等）
                    if res_id[0] != ' ':
                        continue
                    res_seq = res_id[1]
                    chain_id = chain.get_id()
                    sasa = residue.sasa
                    # 转换为相对 RSA
                    # 三字母 → 单字母
                    aa_map = {
                        'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D', 'CYS': 'C',
                        'GLN': 'Q', 'GLU': 'E', 'GLY': 'G', 'HIS': 'H', 'ILE': 'I',
                        'LEU': 'L', 'LYS': 'K', 'MET': 'M', 'PHE': 'F', 'PRO': 'P',
                        'SER': 'S', 'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V',
                    }
                    aa = aa_map.get(res_name)
                    if aa and aa in MAX_ASA:
                        rsa = sasa / MAX_ASA[aa]
                        rsa = min(rsa, 1.0)  # 夹到 0-1
                    else:
                        rsa = sasa / 200.0  # 未知残基用默认值
                        rsa = min(rsa, 1.0)
                    rsa_map[(chain_id, res_seq)] = rsa
            break  # 只处理第一个 model
        return rsa_map
    except Exception:
        return {}


def _build_rsa_by_position(pdb_text: str) -> list:
    """从 PDB 计算每个残基的 RSA，按序列顺序返回列表。

    Returns:
        list[float | None]: 与序列等长的 RSA 列表，无结构时返回空列表
    """
    if not pdb_text:
        return []

    rsa_map = compute_rsa_from_pdb(pdb_text)
    if not rsa_map:
        return []

    # 按链和残基编号排序，构建有序列表
    result = []
    sorted_keys = sorted(rsa_map.keys(), key=lambda k: (k[0], k[1]))
    for key in sorted_keys:
        result.append(rsa_map[key])
    return result


# ═══════════════════════════════════════════════════════════════
# 蛋白类型识别
# ═══════════════════════════════════════════════════════════════

_AB_FRAMEWORK_RE = re.compile(r"C.{8,40}W.{20,60}C")
_AB_JH_RE = re.compile(r"[WF]G.G")


def identify_protein_type(sequence: str) -> str:
    if len(sequence) < 50:
        return "Peptide"
    has_framework = bool(_AB_FRAMEWORK_RE.search(sequence))
    has_j_motif = bool(_AB_JH_RE.search(sequence))
    if has_framework and has_j_motif:
        return "Antibody"
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
    if pos >= VARIABLE_REGION_END:
        return "Fc"
    for start, end, label in REGION_MAP_HEAVY:
        if start <= pos < end:
            return label
    return "FR"


# ═══════════════════════════════════════════════════════════════
# 主扫描函数
# ═══════════════════════════════════════════════════════════════

def scan_sequence(sequence: str, pdb_text: str = None) -> dict:
    """扫描序列，返回所有命中的 PTM hotspot 位点。

    Args:
        sequence: 氨基酸序列
        pdb_text: 可选的 PDB 文本，用于计算真实 RSA
    """
    sequence = sequence.strip().upper()
    seq_len = len(sequence)

    # 1. 识别蛋白类型
    protein_type = identify_protein_type(sequence)
    is_antibody = protein_type == "Antibody"

    # 2. 计算 RSA（有结构时用真实值，无结构时为空列表）
    rsa_list = _build_rsa_by_position(pdb_text) if pdb_text else []
    has_rsa = len(rsa_list) >= seq_len

    # 3. 扫描 hotspot
    hotspots = []
    buried_filtered = []

    for rule in HOTSPOT_RULES:
        for match in re.finditer(rule["pattern"], sequence):
            pos = match.start()
            base_risk = rule["risk"]

            # 区域分配
            region = _assign_region_antibody(pos, seq_len) if is_antibody else "N/A"

            # RSA 取值：取匹配区间内最大的 RSA（最暴露的残基）
            if has_rsa:
                rsa_values = rsa_list[match.start():match.end()]
                rsa = max(rsa_values) if rsa_values else 0.0
            else:
                rsa = None  # 无结构，RSA 不可用

            # PRD 过滤规则（仅在有 RSA 时生效）
            if rsa is not None and rsa < 0.05:
                # 深埋：RSA < 5%，移入结构屏蔽清单
                buried_filtered.append({
                    "group":      rule["group"],
                    "rule_name":  rule["rule_name"],
                    "motif":      match.group(),
                    "regex":      rule["regex"],
                    "start":      match.start(),
                    "end":        match.end(),
                    "region":     region,
                    "base_risk":  base_risk,
                    "final_risk": base_risk,
                    "rsa":        rsa,
                    "category":   rule["category"],
                })
                continue

            # CDR 风险提升
            final_risk = base_risk
            if is_antibody and region.startswith("CDR"):
                if rsa is not None and rsa > 0.20:
                    if base_risk in ("High", "Medium"):
                        final_risk = "Critical"
                elif rsa is None:
                    # 无结构时不做 RSA 相关提升
                    pass

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
                "rsa":        rsa if rsa is not None else -1,  # -1 表示无数据
                "category":   rule["category"],
            })

    # 4. 排序 & 去重
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
        "has_rsa":         has_rsa,
        "hotspots":        unique,
        "buried_filtered": buried_filtered,
    }
