import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, Navigate, useNavigate } from 'react-router-dom';
import SequenceStrip from '../components/SequenceStrip.jsx';
import ProteinViewer from '../ProteinViewer.jsx';
import RulesModal from '../components/RulesModal.jsx';

const API_BASE =
  import.meta?.env?.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

const groupOrder = [
  '脱酰胺', '氧化', '异构化', '糖基化',
  '游离巯基', '细胞粘附', '裂解', '蛋白水解',
  '环化', '羟基化', '赖氨酸糖基化', '糖基化终产物',
];

const riskRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const riskBadge = {
  Critical: 'bg-red-500/20 text-red-500',
  High:     'bg-red-500/20 text-red-400',
  Medium:   'bg-orange-500/20 text-orange-400',
  Low:      'bg-yellow-500/20 text-yellow-300',
};
const riskColor = {
  Critical: 'text-red-500',
  High:     'text-red-400',
  Medium:   'text-orange-400',
  Low:      'text-yellow-300',
};

// Tooltip icon next to the 风险评分 header
function ScoreTooltip() {
  return (
    <span className="relative group inline-flex items-center cursor-help">
      <svg className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors"
        viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      </svg>
      {/* Tooltip panel — appears below the icon */}
      <div className="absolute top-full left-0 mt-2 hidden group-hover:block z-[100] pointer-events-none"
        style={{ width: 'max-content' }}>
        {/* Arrow */}
        <div className="ml-1.5 w-2.5 h-2.5 bg-[#141414] border-l border-t border-[#555] rotate-45 -mb-1.5 ml-3" />
        <div className="bg-[#141414] border border-[#555] rounded-xl px-3.5 py-2.5 shadow-2xl whitespace-nowrap">
          <span className="text-xs text-slate-300">得分越低，代表该序列越稳定。</span>
          <span className="font-mono text-[11px] text-slate-400">Total_Score = </span>
          <span className="font-mono text-[11px]">
            (N<sub className="text-red-500">Critical</sub><span className="text-slate-400"> × </span><span className="text-red-500">10</span>)
          </span>
          <span className="font-mono text-[11px] text-slate-600"> + </span>
          <span className="font-mono text-[11px]">
            (N<sub className="text-red-400">High</sub><span className="text-slate-400"> × </span><span className="text-red-400">5</span>)
          </span>
          <span className="font-mono text-[11px] text-slate-600"> + </span>
          <span className="font-mono text-[11px]">
            (N<sub className="text-orange-400">Medium</sub><span className="text-slate-400"> × </span><span className="text-orange-400">2</span>)
          </span>
          <span className="font-mono text-[11px] text-slate-600"> + </span>
          <span className="font-mono text-[11px]">
            (N<sub className="text-yellow-300">Low</sub><span className="text-slate-400"> × </span><span className="text-yellow-300">1</span>)
          </span>
        </div>
      </div>
    </span>
  );
}

// Cell color for comparison table counts
const cellRiskColor = {
  Critical: 'text-red-500 font-bold',
  High:     'text-red-400 font-semibold',
  Medium:   'text-orange-400',
  Low:      'text-yellow-300',
};

// Comparison table column definitions (matches backend HOTSPOT_RULES rule_name)
const COLUMN_GROUPS = [
  {
    group: '脱酰胺',
    groupEn: 'Deamidation',
    thClass: 'bg-blue-900/20',
    labelClass: 'text-blue-300',
    motifs: [
      { key: 'NG', ruleName: '脱酰胺-NG', risk: 'High' },
      { key: 'NS', ruleName: '脱酰胺-NS', risk: 'Medium' },
      { key: 'NH', ruleName: '脱酰胺-NH', risk: 'Medium' },
      { key: 'NT', ruleName: '脱酰胺-NT', risk: 'Medium' },
      { key: 'NN', ruleName: '脱酰胺-NN', risk: 'Medium' },
      { key: 'NA', ruleName: '脱酰胺-NA', risk: 'Low' },
      { key: 'NE', ruleName: '脱酰胺-NE', risk: 'Low' },
      { key: 'NV', ruleName: '脱酰胺-NV', risk: 'Low' },
    ],
    cdrFreq:  [13.1, 10.3, 1.9, 2.6, 7.5, null, null, null],
    germFreq: [10.5, 13.1, 3.4, 1.1, 8.4, null, null, null],
  },
  {
    group: '氧化',
    groupEn: 'Oxidation',
    thClass: 'bg-yellow-900/20',
    labelClass: 'text-yellow-300',
    motifs: [
      { key: 'M', ruleName: '氧化-M',  risk: 'Medium' },
      { key: 'W', ruleName: '氧化-W',  risk: 'Medium' },
      { key: 'H', ruleName: '氧化-H',  risk: 'Low' },
      { key: 'C', ruleName: '氧化-C',  risk: 'Low' },
    ],
    cdrFreq:  [null, null, null, null],
    germFreq: [null, null, null, null],
  },
  {
    group: '异构化',
    groupEn: 'Isomerization',
    thClass: 'bg-purple-900/20',
    labelClass: 'text-purple-300',
    motifs: [
      { key: 'DG', ruleName: '异构化-DG', risk: 'High' },
      { key: 'DS', ruleName: '异构化-DS', risk: 'Medium' },
      { key: 'DH', ruleName: '异构化-DH', risk: 'Medium' },
      { key: 'DT', ruleName: '异构化-DT', risk: 'Medium' },
      { key: 'DD', ruleName: '异构化-DD', risk: 'Medium' },
    ],
    cdrFreq:  [0.0, 1.9, 1.9, 23.4, 23.4],
    germFreq: [0.6, 3.4, 3.4, 33.0, 33.0],
  },
  {
    group: '糖基化',
    groupEn: 'Glycosylation',
    thClass: 'bg-green-900/20',
    labelClass: 'text-green-300',
    motifs: [
      { key: 'N-X-T', ruleName: 'N-糖基化-NXT', risk: 'High' },
      { key: 'N-X-S', ruleName: 'N-糖基化-NXS', risk: 'Medium' },
      { key: 'O-S',   ruleName: 'O-糖基化-S',   risk: 'Medium' },
      { key: 'O-T',   ruleName: 'O-糖基化-T',   risk: 'Medium' },
    ],
    cdrFreq:  [null, null, null, null],
    germFreq: [null, null, null, null],
  },
  {
    group: '游离巯基',
    groupEn: 'Free Cys',
    thClass: 'bg-cyan-900/20',
    labelClass: 'text-cyan-300',
    motifs: [
      { key: 'C', ruleName: '游离巯基-Cys', risk: 'High' },
    ],
    cdrFreq:  [null],
    germFreq: [null],
  },
  {
    group: '细胞粘附',
    groupEn: 'Cell Adhesion',
    thClass: 'bg-red-900/20',
    labelClass: 'text-red-300',
    motifs: [
      { key: 'RGD', ruleName: '细胞粘附-RGD', risk: 'Medium' },
      { key: 'LDV', ruleName: '细胞粘附-LDV', risk: 'Medium' },
      { key: 'KGD', ruleName: '细胞粘附-KGD', risk: 'Medium' },
    ],
    cdrFreq:  [null, null, null],
    germFreq: [null, null, null],
  },
  {
    group: '裂解',
    groupEn: 'Fragmentation',
    thClass: 'bg-orange-900/20',
    labelClass: 'text-orange-300',
    motifs: [
      { key: 'DP', ruleName: '裂解-DP', risk: 'Medium' },
      { key: 'DK', ruleName: '裂解-DK', risk: 'Low' },
      { key: 'EA', ruleName: '裂解-EA', risk: 'Low' },
      { key: 'TS', ruleName: '裂解-TS', risk: 'Low' },
    ],
    cdrFreq:  [7.5, null, null, null],
    germFreq: [1.9, null, null, null],
  },
  {
    group: '蛋白水解',
    groupEn: 'Proteolysis',
    thClass: 'bg-rose-900/20',
    labelClass: 'text-rose-300',
    motifs: [
      { key: 'TS', ruleName: '蛋白水解-TS', risk: 'Low' },
      { key: 'NP', ruleName: '蛋白水解-NP', risk: 'Low' },
    ],
    cdrFreq:  [null, null],
    germFreq: [null, null],
  },
  {
    group: '环化',
    groupEn: 'Cyclization',
    thClass: 'bg-indigo-900/20',
    labelClass: 'text-indigo-300',
    motifs: [
      { key: 'N-Q', ruleName: '环化-N端Q', risk: 'Low' },
      { key: 'N-E', ruleName: '环化-N端E', risk: 'Low' },
    ],
    cdrFreq:  [null, null],
    germFreq: [null, null],
  },
  {
    group: '羟基化',
    groupEn: 'Hydroxylation',
    thClass: 'bg-teal-900/20',
    labelClass: 'text-teal-300',
    motifs: [
      { key: 'KG', ruleName: '羟基化-KG', risk: 'High' },
    ],
    cdrFreq:  [null],
    germFreq: [null],
  },
  {
    group: '赖氨酸糖基化',
    groupEn: 'Lys Glycation',
    thClass: 'bg-amber-900/20',
    labelClass: 'text-amber-300',
    motifs: [
      { key: 'KE', ruleName: '赖氨酸糖基化-KE', risk: 'Medium' },
      { key: 'KD', ruleName: '赖氨酸糖基化-KD', risk: 'Medium' },
      { key: 'KK', ruleName: '赖氨酸糖基化-KK', risk: 'Medium' },
    ],
    cdrFreq:  [null, null, null],
    germFreq: [null, null, null],
  },
  {
    group: '糖基化终产物',
    groupEn: 'AGE',
    thClass: 'bg-lime-900/20',
    labelClass: 'text-lime-300',
    motifs: [
      { key: 'K', ruleName: '糖基化终产物-K', risk: 'Low' },
    ],
    cdrFreq:  [null],
    germFreq: [null],
  },
];

/** 风险评分：Total_Score = N_Critical×10 + N_High×5 + N_Medium×2 + N_Low×1
 *  可传入 customRules / userRules 实时反映规则变更（启用/禁用、风险等级覆盖）
 */
function calcScore(result, customRules = {}, userRules = []) {
  if (!result?.hotspots) return null;
  const disabledUserRuleNames = new Set(
    userRules.filter(r => r.enabled === false).map(r => `custom-${r.group}-${r.motif}`)
  );
  let score = 0;
  for (const h of result.hotspots) {
    const ruleCfg = customRules[h.rule_name];
    if (ruleCfg?.enabled === false) continue;                  // 默认规则被禁用
    if (disabledUserRuleNames.has(h.rule_name)) continue;      // 用户规则被禁用
    // 使用覆盖后的风险等级，否则回退到后端返回值
    const r = ruleCfg?.risk || h.final_risk || h.base_risk;
    if (r === 'Critical')    score += 10;
    else if (r === 'High')   score += 5;
    else if (r === 'Medium') score += 2;
    else if (r === 'Low')    score += 1;
  }
  return score;
}

function topRisk(result) {
  if (!result?.hotspots?.length) return null;
  return result.hotspots.reduce((best, h) => {
    const r = h.final_risk || h.base_risk;
    return (riskRank[r] ?? 99) < (riskRank[best] ?? 99) ? r : best;
  }, 'Low');
}

// ─── HotspotList (detail view) ─────────────────────────────────────────────

function HotspotList({ result }) {
  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">
        扫描中…
      </div>
    );
  }
  const groups = [
    ...groupOrder,
    ...(result.hotspots || [])
      .map(h => h.group)
      .filter(g => !groupOrder.includes(g))
      .filter((g, i, a) => a.indexOf(g) === i),
  ];
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="rounded-xl bg-[#1F1F1F]">
        {result.hotspots?.length > 0 ? (
          <div className="text-sm">
            {groups.map(groupLabel => {
              const items = (result.hotspots || [])
                .filter(h => h.group === groupLabel)
                .sort((a, b) => {
                  const ra = riskRank[a.final_risk] ?? 99;
                  const rb = riskRank[b.final_risk] ?? 99;
                  return ra !== rb ? ra - rb : a.start - b.start;
                });
              if (!items.length) return null;
              return (
                <div key={groupLabel} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold tracking-wide text-slate-300 uppercase">
                      {groupLabel.replace(/^\d+\.\s*/, '')}
                    </h3>
                    <span className="text-sm text-neutral-500">共 {items.length} 个风险位点</span>
                  </div>
                  <ul className="space-y-2">
                    {items.map((h, idx) => (
                      <li key={idx} className="rounded-lg px-3 py-2.5 bg-[#292929]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-50 text-sm">
                            基序：<span translate="no">{h.motif}</span>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${riskBadge[h.final_risk] || 'bg-slate-500/20 text-slate-400'}`}>
                            {h.final_risk}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-400 space-x-2">
                          <span className="text-slate-100">
                            位点区间：{h.end - h.start === 1 ? h.start + 1 : `${h.start + 1} - ${h.end}`}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-400 space-x-2">
                          {h.region && h.region !== 'N/A' && (
                            <span className={h.region.startsWith('CDR') ? 'text-red-300' : 'text-slate-400'}>
                              区域：{h.region}
                            </span>
                          )}
                          <span>{h.region && h.region !== 'N/A' ? '| ' : ''}RSA：{h.rsa >= 0 ? `${(h.rsa * 100).toFixed(1)}%` : 'N/A'}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-slate-400">未检测到任何符合规则的 Hotspot 基序。</div>
        )}
      </div>
    </div>
  );
}

// ─── Detail-view CSV export ─────────────────────────────────────────────────

function exportDetailCsv(result, seqName) {
  if (!result?.hotspots?.length) return;
  const headers = ['RuleName', 'Motif', 'Regex', 'Start', 'End', 'Region', 'BaseRisk', 'FinalRisk', 'RSA'];
  const sorted = [...result.hotspots].sort((a, b) => {
    const ga = groupOrder.indexOf(a.group), gb = groupOrder.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.start - b.start;
  });
  const rows = sorted.map(h => [
    `"${h.rule_name ?? ''}"`, `"${h.motif ?? ''}"`, `"${h.regex ?? ''}"`,
    h.start, h.end, `"${h.region ?? ''}"`, `"${h.base_risk ?? ''}"`,
    `"${h.final_risk ?? ''}"`, (h.rsa ?? 0).toFixed(3),
  ]);
  const csv = headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hotspot_${seqName ?? 'detail'}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV export ────────────────────────────────────────────────────────────

function exportComparison(displayList, groups, matrix) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Header row 1: group spans (blank for name/seq/score columns)
  const h1 = ['', '', ''];
  for (const g of groups) {
    h1.push(g.isCustom ? `${g.group}（自定义）` : `${g.groupEn}(${g.group})`);
    for (let i = 1; i < g.motifs.length; i++) h1.push('');
  }

  // Header row 2: column labels
  const h2 = ['序列名称', '氨基酸序列', '风险评分'];
  for (const g of groups) {
    for (const m of g.motifs) h2.push(m.key + (m.isCustom ? '*' : ''));
  }

  const rows = [h1, h2];
  for (const { s, r, score } of displayList) {
    const counts = matrix[s.id] || {};
    const row = [s.name, s.sequence, score ?? ''];
    for (const g of groups) {
      for (const m of g.motifs) row.push(counts[m.ruleName] || 0);
    }
    rows.push(row);
  }

  const csv = '\ufeff' + rows.map(r => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hotspot_comparison_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── ComparisonTable ───────────────────────────────────────────────────────

function ComparisonTable({ displayList, recommendedIds, groups = COLUMN_GROUPS, filterOpen, setFilterOpen, activeFilterCount = 0, filterBar, onClearFilters, onRowClick, onRulesOpen, onToggleRule, showCdrColumn = false, defaultRules, customRules = {}, userRules = [] }) {
  const allGroups = groups;

  // Per-column header filter state
  const [colFilters, setColFilters] = useState({});
  const [filterDropdown, setFilterDropdown] = useState(null); // null | { colKey, x, y }

  // Build ruleName → count map per sequence
  const matrix = useMemo(() => {
    const result = {};
    for (const { s, r } of displayList) {
      result[s.id] = {};
      if (r?.status === 'done' && r.result?.hotspots) {
        for (const h of r.result.hotspots) {
          const rn = h.rule_name;
          if (rn) result[s.id][rn] = (result[s.id][rn] || 0) + 1;
        }
      }
    }
    return result;
  }, [displayList]);

  // Helper: get the display cell value for a given colKey and row data
  function getCellValue(colKey, s, score, counts) {
    if (colKey === '__name__') return s.name;
    if (colKey === '__score__') return score === null ? '—' : String(score);
    if (colKey.startsWith('__group__')) {
      const groupName = colKey.slice(9);
      const g = allGroups.find(x => x.group === groupName);
      if (!g) return '0';
      return String(g.motifs.reduce((sum, m) => sum + (counts[m.ruleName] || 0), 0));
    }
    return String(counts[colKey] || 0);
  }

  // Helper: collect unique sorted values for a column across all displayList rows
  function getColValues(colKey) {
    // Group-level filter: options are the motif keys within that group
    if (colKey.startsWith('__group__')) {
      const grpName = colKey.slice('__group__'.length);
      const grp = allGroups.find(g => g.group === grpName);
      return grp ? grp.motifs.map(m => m.key) : [];
    }
    const seen = new Set();
    for (const { s, score } of displayList) {
      const counts = matrix[s.id] || {};
      seen.add(getCellValue(colKey, s, score, counts));
    }
    const vals = Array.from(seen);
    vals.sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
    return vals;
  }

  // Compute filteredList applying active colFilters
  const filteredList = useMemo(() => {
    let list = displayList;
    for (const [colKey, selSet] of Object.entries(colFilters)) {
      if (selSet == null) continue;

      // Group-level filters control column visibility, not row filtering — skip here
      if (colKey.startsWith('__group__')) continue;

      const allVals = (() => {
        const seen = new Set();
        for (const { s, score } of displayList) {
          const counts = matrix[s.id] || {};
          seen.add(getCellValue(colKey, s, score, counts));
        }
        return seen;
      })();
      if (selSet.size >= allVals.size) continue; // all selected = no filter
      list = list.filter(({ s, score }) => {
        const counts = matrix[s.id] || {};
        return selSet.has(getCellValue(colKey, s, score, counts));
      });
    }
    return list;
  }, [displayList, colFilters, matrix]);

  // Derive hidden motif ruleNames from disabled customRules / userRules
  const hiddenMotifRules = useMemo(() => {
    const hidden = new Set();
    // User rules: disabled state is tracked by matching backend ruleName format
    const disabledUserRuleNames = new Set(
      userRules.filter(r => r.enabled === false).map(r => `custom-${r.group}-${r.motif}`)
    );
    for (const g of allGroups) {
      for (const m of g.motifs) {
        if (customRules[m.ruleName]?.enabled === false) hidden.add(m.ruleName);
        if (disabledUserRuleNames.has(m.ruleName)) hidden.add(m.ruleName);
      }
    }
    return hidden;
  }, [allGroups, customRules, userRules]);

  // Pagination
  const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => { setPage(1); }, [filteredList]);
  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const pagedList = filteredList.slice((page - 1) * pageSize, page * pageSize);

  // Helper: open dropdown for a column header
  function openDropdown(e, colKey) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setFilterDropdown({ colKey, x: rect.left, y: rect.bottom + 4 });
  }

  // Helper: is column actively filtered (non-trivially)?
  function isColFiltered(colKey) {
    if (colKey.startsWith('__group__')) {
      const grpName = colKey.slice('__group__'.length);
      const grp = allGroups.find(g => g.group === grpName);
      return grp ? grp.motifs.some(m => hiddenMotifRules.has(m.ruleName)) : false;
    }
    const selSet = colFilters[colKey];
    if (!selSet || selSet.size === 0) return false;
    const allVals = getColValues(colKey);
    return selSet.size < allVals.length;
  }

  // Funnel icon SVG
  function FunnelIcon({ active }) {
    return (
      <svg
        className={`w-3 h-3 shrink-0 transition-opacity ${active ? 'opacity-100 text-[#5D56C1]' : 'opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-slate-200'}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 01.707 1.707L14 12.414V19a1 1 0 01-1.447.894l-4-2A1 1 0 018 17v-4.586L3.293 5.707A1 1 0 013 5V4z" />
      </svg>
    );
  }

  // Dropdown panel content
  let dropdownPanel = null;
  if (filterDropdown) {
    const { colKey, x, y } = filterDropdown;
    const isGroupCol = colKey.startsWith('__group__');
    const allVals = getColValues(colKey);
    const selSet = isGroupCol ? null : colFilters[colKey];
    const label = colKey === '__name__' ? '序列名称' : colKey === '__score__' ? '风险评分' : colKey.length > 18 ? colKey.slice(0, 16) + '…' : colKey;

    // For group columns, resolve motif key → ruleName via the group definition
    const grpDef = isGroupCol
      ? allGroups.find(g => g.group === colKey.slice('__group__'.length))
      : null;

    function isChecked(val) {
      if (isGroupCol) {
        const m = grpDef?.motifs.find(m => m.key === val);
        return !m || !hiddenMotifRules.has(m.ruleName);
      }
      return selSet == null || selSet.has(val);
    }

    function toggleVal(val) {
      if (isGroupCol) {
        // Sync to customRules / userRules so RulesModal stays in sync
        const m = grpDef?.motifs.find(m => m.key === val);
        if (m) onToggleRule?.(m.ruleName, hiddenMotifRules.has(m.ruleName)); // hidden → enable; visible → disable
        return;
      }
      setColFilters(prev => {
        const prevSet = prev[colKey] ? new Set(prev[colKey]) : new Set(allVals);
        if (prevSet.has(val)) {
          prevSet.delete(val);
        } else {
          prevSet.add(val);
        }
        // If all selected, clear the filter
        if (prevSet.size >= allVals.length) {
          const next = { ...prev };
          delete next[colKey];
          return next;
        }
        return { ...prev, [colKey]: prevSet };
      });
    }

    const showSelectAll = !isGroupCol && (colKey === '__name__' || colKey === '__score__');

    dropdownPanel = (
      <>
        <div className="fixed inset-0 z-[90]" onClick={() => setFilterDropdown(null)} />
        <div
          style={{ position: 'fixed', top: y, left: x, zIndex: 100 }}
          className="w-52 rounded-xl bg-[#1F1F1F] border border-[#3a3a3a] shadow-2xl shadow-black/50 p-3 space-y-2">
          {!colKey.startsWith('__group__') && (
            <div className="text-xs font-semibold text-slate-300 truncate">{label}</div>
          )}
          {showSelectAll && (
            <div className="flex items-center gap-2 text-[11px]">
              <button type="button" onClick={() => setColFilters(prev => { const next = { ...prev }; delete next[colKey]; return next; })}
                className="text-[#5D56C1] hover:underline">全选</button>
              <span className="text-neutral-600">/</span>
              <button type="button" onClick={() => setColFilters(prev => ({ ...prev, [colKey]: new Set() }))}
                className="text-[#5D56C1] hover:underline">全不选</button>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
            {allVals.map(val => (
              <label key={val} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  className="accent-[#5D56C1] shrink-0"
                  checked={isChecked(val)}
                  onChange={() => toggleVal(val)}
                />
                <span className="text-[11px] text-slate-300 truncate group-hover:text-slate-100" title={val}>{val}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFilterDropdown(null)}
            className="w-full py-1 rounded-lg bg-[#5D56C1] hover:bg-[#6e67d4] text-xs text-white transition-colors">
            确定
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* Toolbar: Rules + Filter + Export */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        {/* Scan rules — primary button, leftmost */}
        <button type="button" onClick={() => onRulesOpen?.()}
          disabled={!defaultRules?.length}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-[#5D56C1] hover:bg-[#6e67d4] text-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          扫描规则
        </button>
        <div className="flex items-center gap-2">
        {/* Filter toggle */}
        <div className="relative">
          <button type="button" onClick={() => setFilterOpen(v => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeFilterCount > 0
                ? 'bg-[#5D56C1]/20 text-[#a5a0f3] ring-1 ring-[#5D56C1]/40'
                : 'bg-[#1F1F1F] text-slate-400 hover:text-slate-200'
            }`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {filterOpen && filterBar && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
              <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl bg-[#1F1F1F] border border-[#3a3a3a] shadow-2xl shadow-black/40">
                {filterBar}
                <div className="flex items-center gap-2 px-4 pb-4">
                  <button type="button" onClick={() => setFilterOpen(false)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#5D56C1] text-xs text-slate-50 hover:bg-[#6d66d4] transition-colors">
                    确定
                  </button>
                  <button type="button" onClick={() => { onClearFilters?.(); setFilterOpen(false); }}
                    className="flex-1 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-[#292929] transition-colors">
                    清空筛选
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Export */}
        <button type="button" onClick={() => exportComparison(filteredList, allGroups, matrix)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#5D56C1] hover:bg-[#6e67d4] text-slate-50 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出 CSV
        </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-2xl bg-[#292929]">
      <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
        <thead className="sticky top-0 z-10">
          {/* Row 1: group headers */}
          <tr>
            <th rowSpan={2}
              className="group sticky left-0 z-20 bg-[#1F1F1F] px-4 py-3 text-left text-sm font-bold text-slate-200 border-b border-r border-[#3a3a3a] whitespace-nowrap"
              style={{ minWidth: 200, width: 200 }}>
              <div className="flex items-center justify-between gap-1">
                <span>Candidates</span>
                <button type="button" onClick={e => openDropdown(e, '__name__')} className="shrink-0">
                  <FunnelIcon active={isColFiltered('__name__')} />
                </button>
              </div>
            </th>
            <th rowSpan={2}
              className="group sticky z-20 bg-[#1F1F1F] px-3 py-3 text-center text-sm font-bold text-slate-200 border-b border-r border-[#3a3a3a] whitespace-nowrap"
              style={{ left: 200, minWidth: 72, width: 72 }}>
              <div className="flex items-center justify-center gap-1">
                风险评分
                <ScoreTooltip />
                <button type="button" onClick={e => openDropdown(e, '__score__')} className="shrink-0">
                  <FunnelIcon active={isColFiltered('__score__')} />
                </button>
              </div>
            </th>
            {showCdrColumn && (
              <th rowSpan={2}
                className="sticky z-20 bg-[#1F1F1F] px-3 py-3 text-center text-sm font-bold text-blue-300 border-b border-r border-[#3a3a3a] whitespace-nowrap"
                style={{ left: 272, minWidth: 76, width: 76 }}>
                CDR命中数
              </th>
            )}
            {allGroups.map(g => {
              const visibleMotifs = g.motifs.filter(m => !hiddenMotifRules.has(m.ruleName));
              if (visibleMotifs.length === 0) return null;
              return (
                <th key={g.group} colSpan={visibleMotifs.length}
                  className={`group px-2 py-2 text-center text-sm font-bold border-b border-r border-[#3a3a3a] whitespace-nowrap bg-[#1F1F1F] ${g.labelClass}`}>
                  <div className="inline-flex items-center gap-1">
                    {g.isCustom ? `${g.group}（自定义）` : `${g.groupEn}(${g.group})`}
                    <button type="button" onClick={e => openDropdown(e, '__group__' + g.group)} className="shrink-0">
                      <FunnelIcon active={isColFiltered('__group__' + g.group)} />
                    </button>
                  </div>
                </th>
              );
            })}
          </tr>
          {/* Row 2: motif sub-headers */}
          <tr>
            {allGroups.map(g => {
              const visibleMotifs = g.motifs.filter(m => !hiddenMotifRules.has(m.ruleName));
              return visibleMotifs.map((m, mi) => (
                <th key={m.ruleName}
                  className={`group px-3 py-1.5 text-center font-mono font-semibold border-b border-[#3a3a3a] whitespace-nowrap bg-[#1F1F1F] ${mi === visibleMotifs.length - 1 ? 'border-r' : ''} ${m.isCustom ? 'text-violet-400' : cellRiskColor[customRules[m.ruleName]?.risk || m.risk]}`}
                  style={{ minWidth: 52 }}>
                  <div className="flex items-center justify-center gap-1">
                    <span translate="no">{m.key}</span>
                    {m.isCustom && <span className="ml-0.5 text-[9px] text-violet-500">*</span>}
                    <button type="button" onClick={e => openDropdown(e, m.ruleName)} className="shrink-0">
                      <FunnelIcon active={isColFiltered(m.ruleName)} />
                    </button>
                  </div>
                </th>
              ));
            })}
          </tr>
        </thead>

        <tbody>
          {/* Data rows */}
          {pagedList.map(({ s, r, score }) => {
            const isRecommended = recommendedIds.has(s.id);
            const counts = matrix[s.id] || {};
            const isPending = r?.status !== 'done' && r?.status !== 'error';
            const isError = r?.status === 'error';
            const rowBg = isRecommended ? 'bg-emerald-900/15' : '';
            const stickyBg = isRecommended ? 'bg-[#162b1e]' : 'bg-[#292929]';
            // score is already computed by calcScore() which respects disabled rules
            const displayScore = score;

            return (
              <tr key={s.id}
                className={`${rowBg} hover:brightness-110 transition-all ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(s.id)}>
                {/* Sticky: name */}
                <td className={`sticky left-0 ${stickyBg} px-4 py-2.5 border-b border-r border-[#3a3a3a] whitespace-nowrap`} style={{ width: 200 }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-200 truncate max-w-[150px]" title={s.name}>{s.name}</span>
                    {isRecommended && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0 leading-none">★</span>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{s.sequence.length} aa</div>
                </td>
                {/* Sticky: score */}
                <td className={`sticky ${stickyBg} px-3 py-2.5 text-center border-b border-r border-[#3a3a3a]`} style={{ left: 200 }}>
                  {displayScore !== null
                    ? <span className="font-mono font-semibold text-slate-200">{displayScore}</span>
                    : isError
                      ? <span className="text-red-400 text-[10px]">失败</span>
                      : <span className="text-neutral-600 text-[10px]">…</span>}
                </td>
                {/* Sticky: CDR hit count */}
                {showCdrColumn && (
                  <td className={`sticky ${stickyBg} px-3 py-2.5 text-center border-b border-r border-[#3a3a3a]`} style={{ left: 272 }}>
                    {isPending ? (
                      <span className="text-neutral-700">·</span>
                    ) : isError ? (
                      <span className="text-neutral-700">—</span>
                    ) : (() => {
                      const cdrCount = r?.result?.hotspots?.filter(h =>
                        h.region?.startsWith('CDR') && !hiddenMotifRules.has(h.rule_name)
                      ).length ?? 0;
                      return <span className={cdrCount > 0 ? 'text-blue-300 font-semibold' : 'text-neutral-600'}>{cdrCount}</span>;
                    })()}
                  </td>
                )}
                {/* Motif counts — skip hidden motifs */}
                {allGroups.map(g => {
                  const visibleMotifs = g.motifs.filter(m => !hiddenMotifRules.has(m.ruleName));
                  return visibleMotifs.map((m, mi) => {
                    const count = counts[m.ruleName] || 0;
                    return (
                      <td key={m.ruleName}
                        className={`px-2 py-2.5 text-center border-b ${mi === visibleMotifs.length - 1 ? 'border-r' : ''} border-[#3a3a3a]`}>
                        {isPending ? (
                          <span className="text-neutral-700">·</span>
                        ) : isError ? (
                          <span className="text-neutral-700">—</span>
                        ) : (
                          <span className={count > 0 ? cellRiskColor[customRules[m.ruleName]?.risk || m.risk] : 'text-neutral-600'}>
                            {count}
                          </span>
                        )}
                      </td>
                    );
                  });
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Paginator */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-1 py-1">
        <span className="text-xs text-neutral-500">共 {filteredList.length} 条</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">每页</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="text-xs rounded bg-[#292929] border border-[#3a3a3a] text-slate-300 px-1.5 py-1 focus:outline-none focus:border-[#5D56C1] cursor-pointer">
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-neutral-500">条</span>
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-neutral-400 tabular-nums">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Column filter dropdown portal */}
      {dropdownPanel}
    </div>
  );
}

// ─── Top N options ─────────────────────────────────────────────────────────

const TOP_OPTIONS = [
  { label: '全部', value: 0 },
  { label: 'Top 5', value: 5 },
  { label: 'Top 10', value: 10 },
];

// ─── Main page ─────────────────────────────────────────────────────────────

export default function BatchResultsPage() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const { batchSequences, batchResults, batchLoading, batchProgress,
          defaultRules, customRules, setCustomRules, userRules, setUserRules,
          runBatchScan } = ctx;

  const [selectedId, setSelectedId] = useState(batchSequences?.[0]?.id ?? null);
  const [viewMode, setViewMode] = useState('compare'); // 'compare' | 'detail'
  const [rulesModalOpen, setRulesModalOpen] = useState(false);

  // Compare-view filter state
  const [filterOpen, setFilterOpen]         = useState(false);
  const [filterTopN, setFilterTopN]         = useState(0);
  const [filterScoreMin, setFilterScoreMin] = useState('');
  const [filterScoreMax, setFilterScoreMax] = useState('');
  const [hiddenGroups, setHiddenGroups]     = useState(new Set());

  // Detail-view state
  const [batchFolding, setBatchFolding]                   = useState({}); // seqId → {status,pdbUrl,pdbText,error}
  const [detailSelectedResidue, setDetailSelectedResidue] = useState(null);

  // Detail-view filter state
  const [detailFilterOpen, setDetailFilterOpen]     = useState(false);
  const [detailFilterGroup, setDetailFilterGroup]   = useState(new Set());
  const [detailFilterRisk, setDetailFilterRisk]     = useState([]);
  const [detailFilterRegion, setDetailFilterRegion] = useState('all');
  const [detailFilterRsaMin, setDetailFilterRsaMin] = useState(0);
  const [detailFilterRsaMax, setDetailFilterRsaMax] = useState(100);
  const startedFoldRef = useRef(new Set());
  const startedFetchRef = useRef(new Set()); // 已发起 RCSB 拉取的 seqId
  // Snapshot of userRules IDs at the moment the rules modal opens — used to
  // detect new rules added during this session and trigger a re-scan.
  const userRulesSnapshotRef = useRef(null);

  // Toggle a rule's enabled state from either the column header filter or the RulesModal.
  // Writes directly to customRules / userRules so both UIs stay in sync.
  const handleToggleRule = useCallback((ruleName, enabled) => {
    const userRule = userRules.find(ur => `custom-${ur.group}-${ur.motif}` === ruleName);
    if (userRule) {
      setUserRules(prev => prev.map(r => r.id === userRule.id ? { ...r, enabled } : r));
    } else {
      setCustomRules(prev => ({ ...prev, [ruleName]: { ...(prev[ruleName] || {}), enabled } }));
    }
  }, [userRules, setUserRules, setCustomRules]);

  // Trigger ESMFold for one sequence in batch detail view
  const predictBatchStructure = useCallback(async (seqId, sequence) => {
    const seq = sequence.trim().toUpperCase();
    if (seq.length > 400) {
      setBatchFolding(prev => ({ ...prev, [seqId]: { status: 'error', pdbUrl: '', pdbText: '', error: '序列超过 400 残基，ESMFold 暂不支持' } }));
      return;
    }
    setBatchFolding(prev => ({ ...prev, [seqId]: { status: 'loading', pdbUrl: '', pdbText: '', error: '' } }));
    try {
      const resp = await fetch(`${API_BASE}/fold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq }),
      });
      if (!resp.ok) throw new Error(`结构预测失败 [HTTP ${resp.status}]`);
      const data = await resp.json();
      const pdbContent = data.pdb;
      if (!pdbContent || !pdbContent.includes('ATOM')) throw new Error('ESMFold 返回的结构数据无效');
      const blob = new Blob([pdbContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setBatchFolding(prev => ({ ...prev, [seqId]: { status: 'done', pdbUrl: url, pdbText: pdbContent, error: data.warning || '' } }));
    } catch (e) {
      setBatchFolding(prev => ({ ...prev, [seqId]: { status: 'error', pdbUrl: '', pdbText: '', error: e.message } }));
    }
  }, []);

  // 从 RCSB PDB 拉取已知结构；失败时 fallback ESMFold
  const fetchPdbStructure = useCallback(async (seqId, pdbId, sequence) => {
    setBatchFolding(prev => ({ ...prev, [seqId]: { status: 'loading', pdbUrl: '', pdbText: '', error: '' } }));
    try {
      const resp = await fetch(`https://files.rcsb.org/download/${pdbId.toUpperCase()}.pdb`);
      if (!resp.ok) throw new Error(`RCSB 未找到 ${pdbId.toUpperCase()} [HTTP ${resp.status}]`);
      const pdbContent = await resp.text();
      if (!pdbContent.includes('ATOM')) throw new Error('PDB 文件无效');
      const blob = new Blob([pdbContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setBatchFolding(prev => ({ ...prev, [seqId]: { status: 'done', pdbUrl: url, pdbText: pdbContent, error: '' } }));
    } catch (_) {
      // RCSB 拉取失败，回退到 ESMFold 预测
      predictBatchStructure(seqId, sequence);
    }
  }, [predictBatchStructure]);

  // Reset detail filters when selected sequence changes
  useEffect(() => {
    setDetailFilterOpen(false);
    setDetailFilterGroup(new Set());
    setDetailFilterRisk([]);
    setDetailFilterRegion('all');
    setDetailFilterRsaMin(0);
    setDetailFilterRsaMax(100);
  }, [selectedId]);

  // Auto-scroll the matching hotspot list item when a residue is selected via SequenceStrip
  useEffect(() => {
    if (viewMode !== 'detail' || !detailSelectedResidue) return;
    const hotspots = selectedResult?.result?.hotspots ?? [];
    const h = hotspots.find(h =>
      detailSelectedResidue - 1 >= (h.start ?? 0) &&
      detailSelectedResidue - 1 < (h.end ?? (h.start ?? 0) + 1)
    );
    if (!h) return;
    const globalIdx = hotspots.indexOf(h);
    const el = document.getElementById(`batch-hotspot-${h.start ?? 0}-${h.end ?? 0}-${globalIdx}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [detailSelectedResidue, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach scores, sort ascending (pending last) — must be before the useEffect that depends on it
  const scoredList = useMemo(() => {
    return batchSequences
      .map(s => {
        const r = batchResults.find(r => r.id === s.id);
        const score = r?.status === 'done' ? calcScore(r.result, customRules, userRules) : null;
        return { s, r, score };
      })
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return a.score - b.score;
      });
  }, [batchSequences, batchResults, customRules, userRules]);

  // Top 5 recommended: lowest-scoring 5 completed sequences
  const recommendedIds = useMemo(() => {
    return new Set(
      scoredList.filter(({ score }) => score !== null).slice(0, 5).map(({ s }) => s.id)
    );
  }, [scoredList]);

  // True if any completed sequence is identified as an antibody
  const hasAntibody = useMemo(() =>
    scoredList.some(({ r }) => r?.result?.protein_type === 'Antibody'),
  [scoredList]);

  // Build the full column group list: predefined + custom motifs merged by group name
  const allColumnGroups = useMemo(() => {
    // Step 1a: collect custom motifs from scan results
    const customByGroup = new Map(); // group → Map(ruleName → motif def)
    for (const { r } of scoredList) {
      if (r?.status !== 'done' || !r.result?.hotspots) continue;
      for (const h of r.result.hotspots) {
        if (!h.rule_name?.startsWith('custom-')) continue;
        const group = h.group || '自定义';
        if (!customByGroup.has(group)) customByGroup.set(group, new Map());
        const motifMap = customByGroup.get(group);
        if (!motifMap.has(h.rule_name)) {
          const prefix = `custom-${group}-`;
          const key = h.rule_name.startsWith(prefix)
            ? h.rule_name.slice(prefix.length)
            : h.rule_name;
          motifMap.set(h.rule_name, {
            key, ruleName: h.rule_name,
            risk: h.base_risk || 'Medium',
            isCustom: true,
          });
        }
      }
    }

    // Step 1b: also include userRules directly so columns appear even with 0 hits
    for (const ur of userRules) {
      if (ur.enabled === false || ur.motif === '(待添加)') continue;
      const group = ur.group;
      const ruleName = `custom-${group}-${ur.motif}`;
      if (!customByGroup.has(group)) customByGroup.set(group, new Map());
      const motifMap = customByGroup.get(group);
      if (!motifMap.has(ruleName)) {
        motifMap.set(ruleName, { key: ur.motif, ruleName, risk: ur.risk, isCustom: true });
      }
    }

    if (customByGroup.size === 0) return COLUMN_GROUPS;

    const predefinedNames = new Set(COLUMN_GROUPS.map(g => g.group));

    // Step 2: merge custom motifs into matching predefined groups
    const result = COLUMN_GROUPS.map(g => {
      const extra = customByGroup.get(g.group);
      if (!extra || extra.size === 0) return g;
      return { ...g, motifs: [...g.motifs, ...extra.values()] };
    });

    // Step 3: append entirely new custom groups
    for (const [group, motifMap] of customByGroup) {
      if (!predefinedNames.has(group)) {
        result.push({
          group,
          groupEn: group,
          labelClass: 'text-violet-300',
          motifs: [...motifMap.values()],
          isCustom: true,
        });
      }
    }
    return result;
  }, [scoredList, userRules]);

  // Apply filters: Top N + score range
  const displayList = useMemo(() => {
    let list = filterTopN === 0
      ? scoredList
      : scoredList.filter(({ score }) => score !== null).slice(0, filterTopN);
    const min = filterScoreMin !== '' ? Number(filterScoreMin) : null;
    const max = filterScoreMax !== '' ? Number(filterScoreMax) : null;
    if (min !== null) list = list.filter(({ score }) => score === null || score >= min);
    if (max !== null) list = list.filter(({ score }) => score === null || score <= max);
    return list;
  }, [scoredList, filterTopN, filterScoreMin, filterScoreMax]);

  // Visible column groups (opt-in: empty = show all, non-empty = show only selected)
  const visibleColumnGroups = useMemo(() =>
    hiddenGroups.size === 0 ? allColumnGroups : allColumnGroups.filter(g => !hiddenGroups.has(g.group)),
  [allColumnGroups, hiddenGroups]);

  // For sequences that already carry pdbText (uploaded PDB files), initialize
  // batchFolding directly — no ESMFold call needed.
  useEffect(() => {
    if (viewMode !== 'detail') return;
    scoredList.forEach(({ s }) => {
      if (!s.pdbText) return;
      setBatchFolding(prev => {
        if (prev[s.id]) return prev;
        const blob = new Blob([s.pdbText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        return { ...prev, [s.id]: { status: 'done', pdbUrl: url, pdbText: s.pdbText, error: '' } };
      });
    });
  }, [viewMode, scoredList]); // eslint-disable-line react-hooks/exhaustive-deps

  // 进入详情页时，对有 pdbId 的条目从 RCSB 拉取结构（失败则 fallback ESMFold）
  useEffect(() => {
    if (viewMode !== 'detail') return;
    scoredList.forEach(({ s }) => {
      if (!s.pdbId || s.pdbText) return; // 已有结构数据则跳过
      if (!startedFetchRef.current.has(s.id)) {
        startedFetchRef.current.add(s.id);
        fetchPdbStructure(s.id, s.pdbId, s.sequence);
      }
    });
  }, [viewMode, scoredList, fetchPdbStructure]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-predict for top-10 sequences when detail view is first shown.
  // Skip sequences that already have structure (pdbText) or a known PDB ID (pdbId).
  useEffect(() => {
    if (viewMode !== 'detail') return;
    const top10 = scoredList.filter(({ score }) => score !== null).slice(0, 10);
    top10.forEach(({ s }) => {
      if (s.pdbText || s.pdbId) return; // structure already handled
      if (!startedFoldRef.current.has(s.id)) {
        startedFoldRef.current.add(s.id);
        predictBatchStructure(s.id, s.sequence);
      }
    });
  }, [viewMode, scoredList, predictBatchStructure]);

  // Early return after all hooks
  if (!batchSequences || batchSequences.length === 0) return <Navigate to="/" replace />;

  const done  = batchResults.filter(r => r.status === 'done').length;
  const total = batchSequences.length;

  // Keep selected item valid across list reorders
  const displayIds = new Set(displayList.map(({ s }) => s.id));
  const effectiveSelectedId = displayIds.has(selectedId) ? selectedId : (displayList[0]?.s.id ?? null);

  const selectedEntry = displayList.find(({ s }) => s.id === effectiveSelectedId);
  const selectedResult = selectedEntry?.r;
  const proteinType = selectedResult?.result?.protein_type;
  const isAntibody = proteinType === 'Antibody';

  return (
    <div className="flex-1 p-4 space-y-2 overflow-hidden flex flex-col">

      {/* Top bar — breadcrumb */}
      <div className="shrink-0 flex items-center justify-between min-w-0 mb-3">
        {viewMode === 'compare' ? (
          <nav className="flex items-center gap-1.5 text-sm">
            <button type="button" onClick={() => navigate('/')}
              className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              返回上传
            </button>
            <span className="text-slate-600">/</span>
            <span className="text-slate-200">分布对比</span>
          </nav>
        ) : (
          <nav className="flex items-center gap-1.5 text-sm min-w-0">
            <button type="button" onClick={() => navigate('/')}
              className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              返回上传
            </button>
            <span className="text-slate-600 shrink-0">/</span>
            <button type="button" onClick={() => setViewMode('compare')}
              className="text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap">
              分布对比
            </button>
            <span className="text-slate-600 shrink-0">/</span>
            <span className="text-slate-200 truncate">候选详情</span>
          </nav>
        )}
        {viewMode === 'compare' && (
          batchLoading
            ? <span className="text-sm text-slate-400">扫描中… {batchProgress.done}/{batchProgress.total}</span>
            : <span className="text-sm text-slate-400">共 {total} 条序列 · 完成 {done}</span>
        )}
      </div>

      {/* Progress bar */}
      {batchLoading && (
        <div className="w-full h-1 rounded-full bg-[#292929] overflow-hidden shrink-0">
          <div className="h-full bg-[#5D56C1] transition-all duration-300"
            style={{ width: `${total ? (batchProgress.done / total) * 100 : 0}%` }} />
        </div>
      )}


      {/* ── Compare view ── */}
      {viewMode === 'compare' && (() => {
        const activeFilterCount = (filterTopN > 0 ? 1 : 0) +
          (filterScoreMin !== '' || filterScoreMax !== '' ? 1 : 0) +
          hiddenGroups.size;
        return (
          <ComparisonTable
            displayList={displayList}
            recommendedIds={recommendedIds}
            groups={visibleColumnGroups}
            filterOpen={filterOpen}
            setFilterOpen={setFilterOpen}
            activeFilterCount={activeFilterCount}
            onRowClick={id => { setSelectedId(id); setViewMode('detail'); }}
            onClearFilters={() => { setFilterTopN(0); setFilterScoreMin(''); setFilterScoreMax(''); setHiddenGroups(new Set()); }}
            showCdrColumn={hasAntibody}
            onToggleRule={handleToggleRule}
            onRulesOpen={() => {
              userRulesSnapshotRef.current = JSON.stringify(
                userRules.map(r => ({ id: r.id, enabled: r.enabled !== false }))
              );
              setRulesModalOpen(true);
            }}
            defaultRules={defaultRules}
            customRules={customRules}
            userRules={userRules}
            filterBar={
              <div className="flex flex-col gap-3 px-4 py-3">
                {/* 序列 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 w-14 shrink-0">序列</span>
                  <div className="flex items-center rounded-lg bg-[#292929] p-0.5 text-xs">
                    {TOP_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setFilterTopN(opt.value)}
                        className={`px-2.5 py-1 rounded-md transition-colors ${filterTopN === opt.value ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 风险评分 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 w-14 shrink-0">风险评分</span>
                  <input type="number" min="0" placeholder="最低"
                    value={filterScoreMin} onChange={e => setFilterScoreMin(e.target.value)}
                    className="w-16 px-2 py-1 rounded-md bg-[#292929] border border-[#444] text-xs text-slate-200 placeholder-neutral-600 focus:outline-none focus:border-[#5D56C1]" />
                  <span className="text-neutral-600 text-xs">—</span>
                  <input type="number" min="0" placeholder="最高"
                    value={filterScoreMax} onChange={e => setFilterScoreMax(e.target.value)}
                    className="w-16 px-2 py-1 rounded-md bg-[#292929] border border-[#444] text-xs text-slate-200 placeholder-neutral-600 focus:outline-none focus:border-[#5D56C1]" />
                </div>
              </div>
            }
          />
        );
      })()}

      {/* ── Detail view ── */}
      {viewMode === 'detail' && (() => {
        const fold = batchFolding[effectiveSelectedId] ?? { status: 'idle' };
        const isTop10 = scoredList.filter(({ score }) => score !== null).slice(0, 10).some(({ s }) => s.id === effectiveSelectedId);
        const curIdx = displayList.findIndex(({ s }) => s.id === effectiveSelectedId);

        return (
          <div className="flex flex-col flex-1 min-h-0 gap-2">

            {/* Sequence switcher */}
            <div className="shrink-0 flex items-center gap-2 px-1">
              {/* Protein name + recommended badge */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h2 className="text-base font-bold text-slate-100 truncate min-w-0">{selectedEntry?.s.name}</h2>
                {selectedEntry && recommendedIds.has(selectedEntry.s.id) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">Recommended</span>
                )}
              </div>
              {/* Prev / counter / Next */}
              <button type="button" disabled={curIdx <= 0}
                onClick={() => setSelectedId(displayList[curIdx - 1].s.id)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs text-neutral-500 shrink-0">{curIdx + 1} / {displayList.length}</span>
              <button type="button" disabled={curIdx >= displayList.length - 1}
                onClick={() => setSelectedId(displayList[curIdx + 1].s.id)}
                className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Main layout: left sequence+3D / right scan results */}
            <div className="flex gap-4 flex-1 min-h-0">

              {/* Left: sequence strip + 3D viewer */}
              <div className="w-[55%] shrink-0 rounded-2xl bg-[#292929] px-4 py-5 flex flex-col gap-3 overflow-hidden">
                <SequenceStrip
                  sequence={selectedEntry?.s.sequence ?? ''}
                  hotspots={selectedResult?.result?.hotspots}
                  selectedResidue={detailSelectedResidue}
                  onSelectResidue={setDetailSelectedResidue}
                  chainInfo={[]}
                />
                <div className="flex-1 rounded-xl overflow-hidden relative bg-[#1a1a1a]">
                  {fold.status === 'idle' && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                      {isTop10
                        ? <p className="text-sm text-slate-400">结构预测准备中…</p>
                        : <button type="button"
                            onClick={() => {
                              startedFoldRef.current.add(effectiveSelectedId);
                              predictBatchStructure(effectiveSelectedId, selectedEntry?.s.sequence ?? '');
                            }}
                            className="px-4 py-2 rounded-lg bg-[#5D56C1] hover:bg-[#6e67d4] text-sm text-slate-50 transition-colors">
                            开始结构预测
                          </button>
                      }
                    </div>
                  )}
                  {fold.status === 'loading' && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#181818]/90 rounded-xl">
                      <div className="text-center space-y-3">
                        <div className="inline-block w-8 h-8 border-2 border-slate-500 border-t-cyan-400 rounded-full animate-spin" />
                        <p className="text-sm text-slate-300">结构预测中…预计需要 10–30 秒</p>
                        <p className="text-xs text-neutral-500">由 ESMFold 提供预测服务</p>
                      </div>
                    </div>
                  )}
                  {fold.status === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <p className="text-sm text-red-400 px-4 text-center">{fold.error}</p>
                      <button type="button"
                        onClick={() => predictBatchStructure(effectiveSelectedId, selectedEntry?.s.sequence ?? '')}
                        className="px-3 py-1.5 rounded-lg text-xs bg-[#292929] border border-[#444] text-slate-300 hover:text-slate-100 transition-colors">
                        重试
                      </button>
                    </div>
                  )}
                  {fold.status === 'done' && fold.error && (
                    <div className="absolute top-2 left-2 right-2 z-10">
                      <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-1.5">⚠ {fold.error}</p>
                    </div>
                  )}
                  {fold.status === 'done' && (
                    <ProteinViewer
                      pdbUrl={fold.pdbUrl ?? ''}
                      pdbFormat="pdb"
                      pdbText={fold.pdbText ?? ''}
                      selectedResidue={detailSelectedResidue}
                      proteinType={proteinType}
                    />
                  )}
                </div>
              </div>

              {/* Right: scan results */}
              {(() => {
                const hotspots = selectedResult?.result?.hotspots ?? [];
                const detailActiveFilterCount =
                  (detailFilterGroup.size > 0 ? 1 : 0) +
                  (detailFilterRisk.length > 0 ? 1 : 0) +
                  (detailFilterRegion !== 'all' ? 1 : 0) +
                  (detailFilterRsaMin > 0 || detailFilterRsaMax < 100 ? 1 : 0);
                const userGroupNames = userRules
                  .filter(ur => ur.enabled !== false && ur.motif !== '(待添加)')
                  .map(ur => ur.group)
                  .filter((g, i, a) => a.indexOf(g) === i);
                const allGroups = [
                  ...groupOrder,
                  ...[
                    ...hotspots.map(h => h.group).filter(g => !groupOrder.includes(g)),
                    ...userGroupNames.filter(g => !groupOrder.includes(g)),
                  ].filter((g, i, a) => a.indexOf(g) === i),
                ];
                return (
                  <div className="flex-1 rounded-2xl bg-[#292929] px-5 py-4 flex flex-col overflow-hidden min-w-0">
                    {/* Header */}
                    <div className="shrink-0 flex items-center justify-between gap-3 pb-3">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-100">扫描结果</h2>
                        {proteinType && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isAntibody ? 'bg-blue-500/20 text-blue-300'
                            : proteinType === 'Peptide' ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-emerald-500/20 text-emerald-300'
                          }`}>{proteinType}</span>
                        )}
                      </div>
                      {hotspots.length > 0 && (
                        <div className="flex items-center gap-2 relative">
                          {/* 筛选按钮 */}
                          <button type="button" onClick={() => setDetailFilterOpen(v => !v)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                              detailActiveFilterCount > 0
                                ? 'bg-[#5D56C1]/20 text-[#a5a0f3] ring-1 ring-[#5D56C1]/40'
                                : 'bg-[#1F1F1F] text-slate-400 hover:text-slate-200'
                            }`}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            筛选{detailActiveFilterCount > 0 ? ` (${detailActiveFilterCount})` : ''}
                          </button>
                          {/* 导出按钮 */}
                          <button type="button"
                            onClick={() => exportDetailCsv(selectedResult?.result, selectedEntry?.s.name)}
                            className="inline-flex items-center justify-center rounded-lg bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] px-4 py-2 text-sm font-medium text-slate-50 transition-colors">
                            导出 CSV
                          </button>
                          {/* 筛选弹窗 */}
                          {detailFilterOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setDetailFilterOpen(false)} />
                              <div className="absolute right-0 top-full mt-2 z-50 w-96 rounded-xl bg-[#1F1F1F] p-5 space-y-5 shadow-xl shadow-black/40 max-h-[80vh] overflow-y-auto">
                                {/* 类别 */}
                                <div className="space-y-2">
                                  <span className="text-xs font-medium text-neutral-400">
                                    类别{detailFilterGroup.size > 0 && <span className="text-[#8b85e0] ml-1">({detailFilterGroup.size})</span>}
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {allGroups.map(g => {
                                      const selected = !detailFilterGroup.has(g);
                                      return (
                                        <button key={g} type="button"
                                          onClick={() => setDetailFilterGroup(prev => { const next = new Set(prev); selected ? next.add(g) : next.delete(g); return next; })}
                                          className={`px-2 py-1 rounded-md text-xs transition-colors ${selected ? 'bg-[#5D56C1] text-slate-50' : 'bg-[#292929] text-slate-400 hover:text-slate-200'}`}>
                                          {g}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                {/* 风险等级 */}
                                <div className="space-y-2">
                                  <span className="text-xs font-medium text-neutral-400">
                                    风险等级{detailFilterRisk.length > 0 && <span className="text-[#8b85e0] ml-1">({detailFilterRisk.length})</span>}
                                  </span>
                                  <div className="flex gap-1.5">
                                    {[
                                      { value: 'Critical', color: 'bg-red-500/20 text-red-500 border-red-500/30' },
                                      { value: 'High',     color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                                      { value: 'Medium',   color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
                                      { value: 'Low',      color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                                    ].map(({ value, color }) => {
                                      const active = detailFilterRisk.includes(value);
                                      return (
                                        <button key={value} type="button"
                                          onClick={() => setDetailFilterRisk(prev => active ? prev.filter(x => x !== value) : [...prev, value])}
                                          className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${active ? 'bg-[#5D56C1] text-slate-50 border-[#5D56C1]' : `${color} border`}`}>
                                          {value}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                                {/* 区域（仅抗体） */}
                                {isAntibody && (
                                  <div className="space-y-2">
                                    <span className="text-xs font-medium text-neutral-400">区域</span>
                                    <div className="flex items-center rounded-lg bg-[#292929] p-0.5 text-xs">
                                      {[
                                        { value: 'all', label: '全部' },
                                        { value: 'cdr', label: 'CDR' },
                                        { value: 'fr',  label: 'FR' },
                                        { value: 'fc',  label: 'Fc' },
                                      ].map(({ value, label }) => (
                                        <button key={value} type="button" onClick={() => setDetailFilterRegion(value)}
                                          className={`flex-1 py-1.5 rounded-md text-center transition-colors ${detailFilterRegion === value ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* RSA */}
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-neutral-400">RSA</span>
                                    <span className="text-xs text-slate-300 font-mono">{detailFilterRsaMin}% – {detailFilterRsaMax}%</span>
                                  </div>
                                  <div className="relative h-7">
                                    <div className="absolute top-2 left-0 right-0 h-2 rounded-full bg-[#292929] overflow-hidden">
                                      <div className="absolute h-full bg-red-500/60"     style={{ left: '0%',  width: '5%'  }} />
                                      <div className="absolute h-full bg-orange-500/50"  style={{ left: '5%',  width: '15%' }} />
                                      <div className="absolute h-full bg-emerald-500/50" style={{ left: '20%', width: '80%' }} />
                                    </div>
                                    <div className="absolute top-2 h-2 rounded-full bg-[#5D56C1]/60"
                                      style={{ left: `${detailFilterRsaMin}%`, width: `${detailFilterRsaMax - detailFilterRsaMin}%` }} />
                                    <input type="range" min={0} max={100} step={1} value={detailFilterRsaMin}
                                      onChange={e => { const v = Number(e.target.value); if (v <= detailFilterRsaMax) setDetailFilterRsaMin(v); }}
                                      className="absolute top-0 left-0 w-full h-7 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#5D56C1] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1F1F1F] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20" />
                                    <input type="range" min={0} max={100} step={1} value={detailFilterRsaMax}
                                      onChange={e => { const v = Number(e.target.value); if (v >= detailFilterRsaMin) setDetailFilterRsaMax(v); }}
                                      className="absolute top-0 left-0 w-full h-7 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#5D56C1] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1F1F1F] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20" />
                                  </div>
                                  <div className="flex gap-1.5">
                                    {[
                                      { label: '深埋 <5%',    min: 0,  max: 5   },
                                      { label: '部分 5-20%', min: 5,  max: 20  },
                                      { label: '暴露 >20%',  min: 20, max: 100 },
                                      { label: '全部',        min: 0,  max: 100 },
                                    ].map(p => (
                                      <button key={p.label} type="button"
                                        onClick={() => { setDetailFilterRsaMin(p.min); setDetailFilterRsaMax(p.max); }}
                                        className={`flex-1 px-1 py-1 rounded-md text-[11px] transition-colors ${
                                          detailFilterRsaMin === p.min && detailFilterRsaMax === p.max
                                            ? 'bg-[#5D56C1] text-slate-50'
                                            : 'bg-[#292929] text-slate-400 hover:text-slate-200'
                                        }`}>
                                        {p.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* 操作 */}
                                <div className="flex items-center gap-2 pt-1">
                                  <button type="button" onClick={() => setDetailFilterOpen(false)}
                                    className="flex-1 px-3 py-2 rounded-lg bg-[#5D56C1] text-xs text-slate-50 hover:bg-[#6d66d4] transition-colors">
                                    确定
                                  </button>
                                  <button type="button"
                                    onClick={() => { setDetailFilterRegion('all'); setDetailFilterGroup(new Set()); setDetailFilterRisk([]); setDetailFilterRsaMin(0); setDetailFilterRsaMax(100); }}
                                    className="flex-1 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-[#292929] transition-colors">
                                    清空筛选
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="shrink-0 text-sm text-slate-400 pb-2">
                      序列长度：{selectedResult?.result?.sequence_length ?? '—'}，命中位点：{hotspots.length} 个
                    </p>

                    {/* Hotspot list */}
                    {selectedResult?.status === 'error' ? (
                      <div className="flex-1 flex items-center justify-center text-sm text-red-400">
                        扫描失败：{selectedResult.error}
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto">
                        <div className="rounded-xl bg-[#1F1F1F]">
                          {hotspots.length > 0 ? (
                            <div className="text-sm">
                              {allGroups
                                .filter(g => !detailFilterGroup.has(g))
                                .map(groupLabel => {
                                  const items = hotspots
                                    .filter(h => h.group === groupLabel)
                                    .filter(h => {
                                      if (detailFilterRegion === 'all') return true;
                                      if (detailFilterRegion === 'cdr') return h.region?.startsWith('CDR');
                                      if (detailFilterRegion === 'fr')  return h.region?.startsWith('FR');
                                      if (detailFilterRegion === 'fc')  return h.region === 'Fc';
                                      return true;
                                    })
                                    .filter(h => detailFilterRisk.length === 0 || detailFilterRisk.includes(h.final_risk))
                                    .filter(h => {
                                      if (detailFilterRsaMin === 0 && detailFilterRsaMax === 100) return true;
                                      if (h.rsa == null || h.rsa < 0) return false;
                                      const pct = h.rsa * 100;
                                      return pct >= detailFilterRsaMin && pct <= detailFilterRsaMax;
                                    })
                                    .sort((a, b) => {
                                      const ra = riskRank[a.final_risk] ?? 99, rb = riskRank[b.final_risk] ?? 99;
                                      return ra !== rb ? ra - rb : a.start - b.start;
                                    });
                                  if (!items.length) return null;
                                  return (
                                    <div key={groupLabel} className="px-4 py-3 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <h3 className="text-base font-bold tracking-wide text-slate-300 uppercase">
                                          {groupLabel.replace(/^\d+\.\s*/, '')}
                                        </h3>
                                        <span className="text-sm text-neutral-500">共 {items.length} 个风险位点</span>
                                      </div>
                                      <ul className="space-y-2">
                                        {items.map((h, idx) => {
                                          const isSelected =
                                            detailSelectedResidue != null &&
                                            detailSelectedResidue - 1 >= (h.start ?? 0) &&
                                            detailSelectedResidue - 1 < (h.end ?? (h.start ?? 0) + 1);
                                          const globalIdx = hotspots.indexOf(h);
                                          const itemId = `batch-hotspot-${h.start ?? 0}-${h.end ?? 0}-${globalIdx}`;
                                          return (
                                          <li key={idx} id={itemId}
                                            className={`rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${isSelected ? 'bg-[#3b3b3b] ring-1 ring-[#5D56C1]' : 'bg-[#292929] hover:bg-[#333333]'}`}
                                            onClick={() => setDetailSelectedResidue(prev => prev === h.start + 1 ? null : h.start + 1)}>
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="font-semibold text-slate-50 text-sm">
                                                基序：<span translate="no">{h.motif}</span>
                                              </div>
                                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${riskBadge[h.final_risk] || 'bg-slate-500/20 text-slate-400'}`}>
                                                {h.final_risk}
                                              </span>
                                            </div>
                                            <div className="mt-1 text-sm text-slate-400 space-x-2">
                                              <span className="text-slate-100">
                                                位点区间：{h.end - h.start === 1 ? h.start + 1 : `${h.start + 1} - ${h.end}`}
                                              </span>
                                            </div>
                                            <div className="mt-1 text-sm text-slate-400 space-x-2">
                                              {h.region && h.region !== 'N/A' && (
                                                <span className={h.region.startsWith('CDR') ? 'text-red-300' : 'text-slate-400'}>
                                                  区域：{h.region}
                                                </span>
                                              )}
                                              <span>{h.region && h.region !== 'N/A' ? '| ' : ''}RSA：{h.rsa >= 0 ? `${(h.rsa * 100).toFixed(1)}%` : 'N/A'}</span>
                                            </div>
                                          </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <div className="px-4 py-6 text-sm text-slate-400">未检测到任何符合规则的 Hotspot 基序。</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          </div>
        );
      })()}

      {/* 扫描规则弹窗 */}
      <RulesModal
        open={rulesModalOpen}
        onClose={() => {
          setRulesModalOpen(false);
          // Re-scan if user rules changed (new rules added, or enabled status toggled)
          if (
            !batchLoading &&
            userRulesSnapshotRef.current !== null &&
            JSON.stringify(userRules.map(r => ({ id: r.id, enabled: r.enabled !== false }))) !== userRulesSnapshotRef.current
          ) {
            runBatchScan(batchSequences);
          }
          userRulesSnapshotRef.current = null;
        }}
        defaultRules={defaultRules}
        customRules={customRules}
        setCustomRules={setCustomRules}
        userRules={userRules}
        setUserRules={setUserRules}
      />
    </div>
  );
}
