import re
import io
import warnings

# ═══════════════════════════════════════════════════════════════
# PTM Hotspot 扫描规则库（基于 PRD 附录规则表）
# group 字段需与前端 groupOrder 完全一致
# ═══════════════════════════════════════════════════════════════
HOTSPOT_RULES = [
    # 脱酰胺
    {"group": "脱酰胺", "rule_name": "脱酰胺-NG", "motif": "NG", "regex": "NG", "pattern": r"NG", "risk": "High",   "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NS", "motif": "NS", "regex": "NS", "pattern": r"NS", "risk": "Medium", "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NT", "motif": "NT", "regex": "NT", "pattern": r"NT", "risk": "Medium", "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NH", "motif": "NH", "regex": "NH", "pattern": r"NH", "risk": "Medium", "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NN", "motif": "NN", "regex": "NN", "pattern": r"NN", "risk": "Medium", "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NA", "motif": "NA", "regex": "NA", "pattern": r"NA", "risk": "Low",    "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NE", "motif": "NE", "regex": "NE", "pattern": r"NE", "risk": "Low",    "category": "化学稳定性"},
    {"group": "脱酰胺", "rule_name": "脱酰胺-NV", "motif": "NV", "regex": "NV", "pattern": r"NV", "risk": "Low",    "category": "化学稳定性"},
    # 氧化
    {"group": "氧化", "rule_name": "氧化-M",  "motif": "M", "regex": "M", "pattern": r"M", "risk": "Medium", "category": "化学稳定性"},
    {"group": "氧化", "rule_name": "氧化-W",  "motif": "W", "regex": "W", "pattern": r"W", "risk": "Medium", "category": "化学稳定性"},
    {"group": "氧化", "rule_name": "氧化-H",  "motif": "H", "regex": "H", "pattern": r"H", "risk": "Low",    "category": "化学稳定性"},
    {"group": "氧化", "rule_name": "氧化-C",  "motif": "C", "regex": "C", "pattern": r"C", "risk": "Low",    "category": "化学稳定性"},
    # 异构化
    {"group": "异构化", "rule_name": "异构化-DG", "motif": "DG", "regex": "DG", "pattern": r"DG", "risk": "High",   "category": "化学稳定性"},
    {"group": "异构化", "rule_name": "异构化-DS", "motif": "DS", "regex": "DS", "pattern": r"DS", "risk": "Medium", "category": "化学稳定性"},
    {"group": "异构化", "rule_name": "异构化-DT", "motif": "DT", "regex": "DT", "pattern": r"DT", "risk": "Medium", "category": "化学稳定性"},
    {"group": "异构化", "rule_name": "异构化-DH", "motif": "DH", "regex": "DH", "pattern": r"DH", "risk": "Medium", "category": "化学稳定性"},
    {"group": "异构化", "rule_name": "异构化-DD", "motif": "DD", "regex": "DD", "pattern": r"DD", "risk": "Medium", "category": "化学稳定性"},
    # 糖基化
    {"group": "糖基化", "rule_name": "N-糖基化-NXT", "motif": "N-X-T", "regex": "N[^P]T", "pattern": r"N[^P]T", "risk": "High",   "category": "安全性风险"},
    {"group": "糖基化", "rule_name": "N-糖基化-NXS", "motif": "N-X-S", "regex": "N[^P]S", "pattern": r"N[^P]S", "risk": "Medium", "category": "安全性风险"},
    {"group": "糖基化", "rule_name": "O-糖基化-S",   "motif": "S",     "regex": "S",      "pattern": r"S",      "risk": "Medium", "category": "安全性风险"},
    {"group": "糖基化", "rule_name": "O-糖基化-T",   "motif": "T",     "regex": "T",      "pattern": r"T",      "risk": "Medium", "category": "安全性风险"},
    # 游离巯基（风险由 scan_sequence 动态判定：奇数 Cys → High，偶数 → 跳过）
    {"group": "游离巯基", "rule_name": "游离巯基-Cys", "motif": "C", "regex": "C", "pattern": r"C", "risk": "High", "category": "安全性风险"},
    # 细胞粘附
    {"group": "细胞粘附", "rule_name": "细胞粘附-RGD", "motif": "RGD", "regex": "RGD", "pattern": r"RGD", "risk": "Medium", "category": "安全性风险"},
    {"group": "细胞粘附", "rule_name": "细胞粘附-LDV", "motif": "LDV", "regex": "LDV", "pattern": r"LDV", "risk": "Medium", "category": "安全性风险"},
    {"group": "细胞粘附", "rule_name": "细胞粘附-KGD", "motif": "KGD", "regex": "KGD", "pattern": r"KGD", "risk": "Medium", "category": "安全性风险"},
    # 裂解
    {"group": "裂解", "rule_name": "裂解-DP", "motif": "DP", "regex": "DP", "pattern": r"DP", "risk": "Medium", "category": "结构完整性"},
    {"group": "裂解", "rule_name": "裂解-DK", "motif": "DK", "regex": "DK", "pattern": r"DK", "risk": "Low",    "category": "结构完整性"},
    {"group": "裂解", "rule_name": "裂解-EA", "motif": "EA", "regex": "EA", "pattern": r"EA", "risk": "Low",    "category": "结构完整性"},
    {"group": "裂解", "rule_name": "裂解-TS", "motif": "TS", "regex": "TS", "pattern": r"TS", "risk": "Low",    "category": "结构完整性"},
    # 蛋白水解
    {"group": "蛋白水解", "rule_name": "蛋白水解-TS", "motif": "TS", "regex": "TS", "pattern": r"TS", "risk": "Low", "category": "其他风险"},
    {"group": "蛋白水解", "rule_name": "蛋白水解-NP", "motif": "NP", "regex": "NP", "pattern": r"NP", "risk": "Low", "category": "其他风险"},
    # 环化
    {"group": "环化", "rule_name": "环化-N端Q", "motif": "N端 Q", "regex": "^Q", "pattern": r"^Q", "risk": "Low", "category": "其他风险"},
    {"group": "环化", "rule_name": "环化-N端E", "motif": "N端 E", "regex": "^E", "pattern": r"^E", "risk": "Low", "category": "其他风险"},
    # 羟基化
    {"group": "羟基化", "rule_name": "羟基化-KG", "motif": "KG", "regex": "KG", "pattern": r"KG", "risk": "High", "category": "其他风险"},
    # 赖氨酸糖基化
    {"group": "赖氨酸糖基化", "rule_name": "赖氨酸糖基化-KE", "motif": "KE", "regex": "KE", "pattern": r"KE", "risk": "Medium", "category": "其他风险"},
    {"group": "赖氨酸糖基化", "rule_name": "赖氨酸糖基化-KD", "motif": "KD", "regex": "KD", "pattern": r"KD", "risk": "Medium", "category": "其他风险"},
    {"group": "赖氨酸糖基化", "rule_name": "赖氨酸糖基化-KK", "motif": "KK", "regex": "KK", "pattern": r"KK", "risk": "Medium", "category": "其他风险"},
    # 糖基化终产物（排除已被羟基化和赖氨酸糖基化覆盖的 KG/KE/KD/KK）
    {"group": "糖基化终产物", "rule_name": "糖基化终产物-K", "motif": "K", "regex": "K", "pattern": r"K(?![GEDK])", "risk": "Low", "category": "其他风险"},
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

def scan_sequence(sequence: str, pdb_text: str = None,
                   disabled_rules: list = None, risk_overrides: dict = None,
                   extra_rules: list = None) -> dict:
    """扫描序列，返回所有命中的 PTM hotspot 位点。

    Args:
        sequence: 氨基酸序列
        pdb_text: 可选的 PDB 文本，用于计算真实 RSA
        disabled_rules: 要跳过的 rule_name 列表
        risk_overrides: {rule_name: new_risk} 用户自定义风险等级
        extra_rules: 用户新增的自定义规则列表
    """
    disabled_set = set(disabled_rules) if disabled_rules else set()
    risk_map = risk_overrides or {}

    # 合并用户自定义规则
    all_rules = list(HOTSPOT_RULES)
    if extra_rules:
        for er in extra_rules:
            all_rules.append({
                "group":     er["group"],
                "rule_name": f"custom-{er['group']}-{er['motif']}",
                "motif":     er["motif"],
                "regex":     er["pattern"],
                "pattern":   er["pattern"],
                "risk":      er["risk"],
                "category":  "自定义",
            })
    sequence = sequence.strip().upper()
    seq_len = len(sequence)

    # 1. 识别蛋白类型
    protein_type = identify_protein_type(sequence)
    is_antibody = protein_type == "Antibody"

    # 2. 计算 RSA（有结构时用真实值，无结构时为空列表）
    rsa_list = _build_rsa_by_position(pdb_text) if pdb_text else []
    has_rsa = len(rsa_list) >= seq_len

    # 3. 游离巯基：统计全序列 Cys 数量，偶数则跳过该规则
    cys_count = sequence.count('C')
    skip_free_cys = (cys_count % 2 == 0)  # 偶数个 Cys 无风险

    # 4. 扫描 hotspot
    hotspots = []
    buried_filtered = []

    for rule in all_rules:
        # 用户禁用的规则跳过
        if rule["rule_name"] in disabled_set:
            continue
        # 游离巯基：偶数个 Cys 时整组跳过
        if rule["group"] == "游离巯基" and skip_free_cys:
            continue

        for match in re.finditer(rule["pattern"], sequence, re.IGNORECASE):
            pos = match.start()
            # 应用用户自定义风险等级
            base_risk = risk_map.get(rule["rule_name"], rule["risk"])

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

            # CDR 风险提升：CDR 区 High/Medium 提升为 Critical
            # 有结构时需 RSA > 0.20（暴露）才提升；无结构时保守地直接提升
            final_risk = base_risk
            if is_antibody and region.startswith("CDR"):
                if base_risk in ("High", "Medium"):
                    if rsa is None or rsa > 0.20:
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
