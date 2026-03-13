import re
from typing import List, Literal, Dict, Any


RiskLevel = Literal["Low", "Medium", "High", "Critical"]


def calculate_rsa_mock(sequence: str) -> Dict[int, float]:
    """
    Mock RSA 计算：暂时不调用 freesasa。
    为所有残基统一返回 0.5 (50%)，以便验证完整业务链路。
    """
    return {i: 0.5 for i in range(len(sequence))}


def _classify_region(position: int) -> str:
    """
    使用简化的 Kabat 近似规则按索引粗略标注 CDR 区域。

    约定：
    - 输入序列按 0-based 索引，折算为 Kabat 1-based：
        kabat_pos = position + 1
    - 近似区间：
        CDR1: 31-35
        CDR2: 50-65
        CDR3: 95-102

    注意：这里只是为了在缺少 ANARCI 的情况下先完成 CDR 高亮验证，
    后续可以直接替换为基于 ANARCI 真实编号的实现。
    """
    kabat_pos = position + 1

    if 31 <= kabat_pos <= 35:
        return "CDR1"
    if 50 <= kabat_pos <= 65:
        return "CDR2"
    if 95 <= kabat_pos <= 102:
        return "CDR3"

    return "FR/OTHER"


def _apply_rsa_business_logic(
    base_risk: RiskLevel,
    rsa: float,
    region: str,
) -> Dict[str, Any]:
    """
    按照 PRD 2.3 中的 RSA 业务规则进行过滤与等级调整。

    - 若 RSA < 0.05：视为深埋 (Buried)，从风险列表剔除，放入结构屏蔽清单。
    - 若 RSA > 0.20：视为暴露 (Exposed)，维持原始风险等级。
    - 若位于 CDR 且 RSA > 0.20：等级提升为 Critical。
    """
    if rsa < 0.05:
        return {
            "keep": False,
            "category": "buried",
            "risk_level": base_risk,
        }

    # 暴露：保留该位点
    final_risk: RiskLevel = base_risk
    if region.startswith("CDR") and rsa > 0.20:
        final_risk = "Critical"

    return {
        "keep": True,
        "category": "exposed",
        "risk_level": final_risk,
    }


def scan_sequence(sequence: str) -> Dict[str, Any]:
    """
    对输入氨基酸序列执行 PTM Hotspot 扫描。
    当前重点实现：
      - 脱酰胺：NG (高风险) - 正则 `NG`
      - 异构化：DG (高风险) - 正则 `DG`

    其他规则类暂预留接口，后续可在本函数中逐步补全。
    """
    seq = sequence.strip().upper()

    rsa_map = calculate_rsa_mock(seq)

    findings: List[Dict[str, Any]] = []
    buried: List[Dict[str, Any]] = []

    def _record_match(
        name: str,
        category: str,
        group: str,
        motif: str,
        regex: str,
        base_risk: RiskLevel,
        start: int,
        end: int,
    ) -> None:
        region = _classify_region(start)
        rsa_value = rsa_map.get(start, 0.5)
        rsa_result = _apply_rsa_business_logic(
            base_risk=base_risk,
            rsa=rsa_value,
            region=region,
        )

        item = {
            "start": start,
            "end": end,
            "motif": motif,
            "regex": regex,
            "category": category,
            "group": group,
            "rule_name": name,
            "base_risk": base_risk,
            "final_risk": rsa_result["risk_level"],
            "rsa": rsa_value,
            "region": region,
        }

        if rsa_result["keep"]:
            findings.append(item)
        else:
            buried.append(item)

    # 1. 脱酰胺 - 高风险 NG
    for match in re.finditer(r"NG", seq):
        _record_match(
            name="Deamidation",
            category="Chemical stability / 脱酰胺",
            group="1. 脱酰胺",
            motif="NG",
            regex="NG",
            base_risk="High",
            start=match.start(),
            end=match.end(),
        )

    # 1. 脱酰胺 - 中风险 NS, NT, NH, NN -> N[STHN]
    for match in re.finditer(r"N[STHN]", seq):
        _record_match(
            name="Deamidation",
            category="Chemical stability / 脱酰胺",
            group="1. 脱酰胺",
            motif=seq[match.start() : match.end()],
            regex="N[STHN]",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 1. 脱酰胺 - 低风险 NA, NE, NV -> N[AEV]
    for match in re.finditer(r"N[AEV]", seq):
        _record_match(
            name="Deamidation",
            category="Chemical stability / 脱酰胺",
            group="1. 脱酰胺",
            motif=seq[match.start() : match.end()],
            regex="N[AEV]",
            base_risk="Low",
            start=match.start(),
            end=match.end(),
        )

    # 2. 氧化 - 表面暴露的 M -> 这里先按序列 M 标记，具体暴露度由 RSA 决定
    for match in re.finditer(r"M", seq):
        _record_match(
            name="Oxidation",
            category="Chemical stability / 氧化",
            group="2. 氧化",
            motif="M",
            regex="M",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 2. 氧化 - 表面暴露的 W
    for match in re.finditer(r"W", seq):
        _record_match(
            name="Oxidation",
            category="Chemical stability / 氧化",
            group="2. 氧化",
            motif="W",
            regex="W",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 2. 氧化 - His / Cys 特定位置，这里按 [HC] 统一扫描
    for match in re.finditer(r"[HC]", seq):
        _record_match(
            name="Oxidation",
            category="Chemical stability / 氧化",
            group="2. 氧化",
            motif=seq[match.start() : match.end()],
            regex="[HC]",
            base_risk="Low",
            start=match.start(),
            end=match.end(),
        )

    # 3. 异构化 - 高风险 DG
    for match in re.finditer(r"DG", seq):
        _record_match(
            name="Isomerization",
            category="Chemical stability / 异构化",
            group="3. 异构化",
            motif="DG",
            regex="DG",
            base_risk="High",
            start=match.start(),
            end=match.end(),
        )

    # 3. 异构化 - 中风险 DS, DT, DH, DD -> D[STHD]
    for match in re.finditer(r"D[STHD]", seq):
        _record_match(
            name="Isomerization",
            category="Chemical stability / 异构化",
            group="3. 异构化",
            motif=seq[match.start() : match.end()],
            regex="D[STHD]",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 4. 糖基化 - N-X-S/T (X != P) -> N[^P][ST]
    for match in re.finditer(r"N[^P][ST]", seq):
        _record_match(
            name="Glycosylation (N-linked)",
            category="Safety / 糖基化",
            group="4. 糖基化",
            motif=seq[match.start() : match.end()],
            regex="N[^P][ST]",
            base_risk="High",
            start=match.start(),
            end=match.end(),
        )

    # 4. 糖基化 - O-糖基化潜在位点 [ST]
    for match in re.finditer(r"[ST]", seq):
        _record_match(
            name="Glycosylation (O-linked)",
            category="Safety / 糖基化",
            group="4. 糖基化",
            motif=seq[match.start() : match.end()],
            regex="[ST]",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 5. 游离巯基 - 奇数个 Cys，这里先按照奇数个 Cys 的整体条件筛选，再标记所有 C
    c_count = seq.count("C")
    if c_count % 2 == 1 and c_count > 0:
        for match in re.finditer(r"C", seq):
            _record_match(
                name="Free thiol",
                category="Safety / 游离巯基",
                group="5. 游离巯基",
                motif="C",
                regex="C",
                base_risk="High",
                start=match.start(),
                end=match.end(),
            )

    # 6. 细胞粘附 - RGD, LDV, KGD
    for match in re.finditer(r"RGD|LDV|KGD", seq):
        _record_match(
            name="Cell adhesion motif",
            category="Safety / 细胞粘附",
            group="6. 细胞粘附",
            motif=seq[match.start() : match.end()],
            regex="RGD|LDV|KGD",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 7. 裂解 - Asp-Pro -> DP
    for match in re.finditer(r"DP", seq):
        _record_match(
            name="Backbone cleavage",
            category="Structural integrity / 裂解",
            group="7. 裂解",
            motif="DP",
            regex="DP",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    # 7. 裂解 - DK, EA, TS -> DK|EA|TS （低风险）
    for match in re.finditer(r"DK|EA|TS", seq):
        _record_match(
            name="Backbone cleavage",
            category="Structural integrity / 裂解",
            group="7. 裂解",
            motif=seq[match.start() : match.end()],
            regex="DK|EA|TS",
            base_risk="Low",
            start=match.start(),
            end=match.end(),
        )

    # 8. 蛋白水解 - TS, NP -> TS|NP
    for match in re.finditer(r"TS|NP", seq):
        _record_match(
            name="Proteolysis",
            category="Other / 蛋白水解",
            group="8. 蛋白水解",
            motif=seq[match.start() : match.end()],
            regex="TS|NP",
            base_risk="Low",
            start=match.start(),
            end=match.end(),
        )

    # 9. 环化 - N 末端 Q/E -> ^[QE]
    for match in re.finditer(r"^[QE]", seq):
        _record_match(
            name="Cyclization (pE)",
            category="Other / 环化",
            group="9. 环化",
            motif=seq[match.start() : match.end()],
            regex="^[QE]",
            base_risk="Low",
            start=match.start(),
            end=match.end(),
        )

    # 10. 糖基化终产物 - Lys (K) -> 这里按 K 扫描，风险等级按 PRD 取中/低的中间值：Medium
    for match in re.finditer(r"K", seq):
        _record_match(
            name="Advanced glycation end-product",
            category="Other / 糖基化终产物",
            group="10. 糖基化终产物",
            motif="K",
            regex="K",
            base_risk="Medium",
            start=match.start(),
            end=match.end(),
        )

    return {
        "sequence_length": len(seq),
        "hotspots": findings,
        "buried_filtered": buried,
    }


__all__ = ["scan_sequence", "calculate_rsa_mock"]

