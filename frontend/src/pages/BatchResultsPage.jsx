import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, Navigate, useNavigate } from 'react-router-dom';
import SequenceStrip from '../components/SequenceStrip.jsx';
import ProteinViewer from '../ProteinViewer.jsx';

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

/** 风险评分：Total_Score = N_Critical×10 + N_High×5 + N_Medium×2 */
function calcScore(result) {
  if (!result?.hotspots) return null;
  let score = 0;
  for (const h of result.hotspots) {
    const r = h.final_risk || h.base_risk;
    if (r === 'Critical')    score += 10;
    else if (r === 'High')   score += 5;
    else if (r === 'Medium') score += 2;
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

function ComparisonTable({ displayList, recommendedIds, groups = COLUMN_GROUPS, filterOpen, setFilterOpen, activeFilterCount = 0, filterBar }) {
  const allGroups = groups;

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

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* Toolbar: Filter button + Export button */}
      <div className="shrink-0 flex justify-end gap-2">
        {/* Filter toggle */}
        <button type="button" onClick={() => setFilterOpen(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors border ${
            filterOpen
              ? 'bg-[#292929] border-[#5D56C1] text-slate-200'
              : 'bg-[#1F1F1F] border-[#3a3a3a] text-slate-400 hover:text-slate-200 hover:border-[#555]'
          }`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M10 12h4" />
          </svg>
          筛选
          {activeFilterCount > 0 && (
            <span className="ml-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#5D56C1] text-[10px] text-white px-1">
              {activeFilterCount}
            </span>
          )}
        </button>
        {/* Export */}
        <button type="button" onClick={() => exportComparison(displayList, allGroups, matrix)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#5D56C1] hover:bg-[#6e67d4] text-slate-50 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          导出 CSV
        </button>
      </div>
      {/* Collapsible filter panel */}
      {filterOpen && filterBar && (
        <div className="shrink-0 rounded-xl bg-[#1F1F1F] border border-[#3a3a3a]">
          {filterBar}
        </div>
      )}
      <div className="flex-1 overflow-auto rounded-2xl bg-[#292929]">
      <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
        <thead className="sticky top-0 z-10">
          {/* Row 1: group headers */}
          <tr>
            <th rowSpan={2}
              className="sticky left-0 z-20 bg-[#1F1F1F] px-4 py-3 text-left text-sm font-bold text-slate-200 border-b border-r border-[#3a3a3a] whitespace-nowrap"
              style={{ minWidth: 200, width: 200 }}>
              PROTEIN
            </th>
            <th rowSpan={2}
              className="sticky z-20 bg-[#1F1F1F] px-3 py-3 text-center text-sm font-bold text-slate-200 border-b border-r border-[#3a3a3a] whitespace-nowrap"
              style={{ left: 200, minWidth: 72, width: 72 }}>
              <div className="flex items-center justify-center gap-1">
                风险评分
                <ScoreTooltip />
              </div>
            </th>
            {allGroups.map(g => (
              <th key={g.group} colSpan={g.motifs.length}
                className={`px-2 py-2 text-center text-sm font-bold border-b border-r border-[#3a3a3a] whitespace-nowrap bg-[#1F1F1F] ${g.labelClass}`}>
                {g.isCustom ? `${g.group}（自定义）` : `${g.groupEn}(${g.group})`}
              </th>
            ))}
          </tr>
          {/* Row 2: motif sub-headers */}
          <tr>
            {allGroups.map(g =>
              g.motifs.map((m, mi) => (
                <th key={m.ruleName}
                  className={`px-3 py-1.5 text-center font-mono font-semibold border-b border-[#3a3a3a] whitespace-nowrap bg-[#1F1F1F] ${mi === g.motifs.length - 1 ? 'border-r' : ''} ${m.isCustom ? 'text-violet-400' : cellRiskColor[m.risk]}`}
                  style={{ minWidth: 52 }}>
                  <span translate="no">{m.key}</span>
                  {m.isCustom && <span className="ml-0.5 text-[9px] text-violet-500">*</span>}
                </th>
              ))
            )}
          </tr>
        </thead>

        <tbody>
          {/* Data rows */}
          {displayList.map(({ s, r, score }) => {
            const isRecommended = recommendedIds.has(s.id);
            const counts = matrix[s.id] || {};
            const isPending = r?.status !== 'done' && r?.status !== 'error';
            const isError = r?.status === 'error';
            const rowBg = isRecommended ? 'bg-emerald-900/15' : '';
            const stickyBg = isRecommended ? 'bg-[#162b1e]' : 'bg-[#292929]';

            return (
              <tr key={s.id} className={`${rowBg} hover:brightness-110 transition-all`}>
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
                  {score !== null
                    ? <span className="font-mono font-semibold text-slate-200">{score}</span>
                    : isError
                      ? <span className="text-red-400 text-[10px]">失败</span>
                      : <span className="text-neutral-600 text-[10px]">…</span>}
                </td>
                {/* Motif counts */}
                {allGroups.map(g =>
                  g.motifs.map((m, mi) => {
                    const count = counts[m.ruleName] || 0;
                    return (
                      <td key={m.ruleName}
                        className={`px-2 py-2.5 text-center border-b ${mi === g.motifs.length - 1 ? 'border-r' : ''} border-[#3a3a3a]`}>
                        {isPending ? (
                          <span className="text-neutral-700">·</span>
                        ) : isError ? (
                          <span className="text-neutral-700">—</span>
                        ) : (
                          <span className={count > 0 ? cellRiskColor[m.risk] : 'text-neutral-600'}>
                            {count}
                          </span>
                        )}
                      </td>
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
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
  const { batchSequences, batchResults, batchLoading, batchProgress } = ctx;

  const [selectedId, setSelectedId] = useState(batchSequences?.[0]?.id ?? null);
  const [viewMode, setViewMode] = useState('compare'); // 'compare' | 'detail'

  // Compare-view filter state
  const [filterOpen, setFilterOpen]         = useState(false);
  const [filterTopN, setFilterTopN]         = useState(0);
  const [filterScoreMin, setFilterScoreMin] = useState('');
  const [filterScoreMax, setFilterScoreMax] = useState('');
  const [hiddenGroups, setHiddenGroups]     = useState(new Set());

  // Detail-view state
  const [detailSortOrder, setDetailSortOrder]             = useState('asc'); // 'asc' | 'desc'
  const [batchFolding, setBatchFolding]                   = useState({}); // seqId → {status,pdbUrl,pdbText,error}
  const [detailSelectedResidue, setDetailSelectedResidue] = useState(null);
  const startedFoldRef = useRef(new Set());

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

  // Attach scores, sort ascending (pending last) — must be before the useEffect that depends on it
  const scoredList = useMemo(() => {
    return batchSequences
      .map(s => {
        const r = batchResults.find(r => r.id === s.id);
        const score = r?.status === 'done' ? calcScore(r.result) : null;
        return { s, r, score };
      })
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return a.score - b.score;
      });
  }, [batchSequences, batchResults]);

  // Top 5 recommended: lowest-scoring 5 completed sequences
  const recommendedIds = useMemo(() => {
    return new Set(
      scoredList.filter(({ score }) => score !== null).slice(0, 5).map(({ s }) => s.id)
    );
  }, [scoredList]);

  // Build the full column group list: predefined + custom motifs merged by group name
  const allColumnGroups = useMemo(() => {
    // Step 1: collect custom motifs, keyed by their group name
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
  }, [scoredList]);

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

  // Detail-view ordered list (respects sort toggle)
  const detailList = useMemo(() =>
    detailSortOrder === 'asc' ? displayList : [...displayList].reverse(),
  [displayList, detailSortOrder]);

  // Visible column groups (hide toggled-off groups)
  const visibleColumnGroups = useMemo(() =>
    hiddenGroups.size === 0 ? allColumnGroups : allColumnGroups.filter(g => !hiddenGroups.has(g.group)),
  [allColumnGroups, hiddenGroups]);

  // Auto-predict for top-10 sequences when detail view is first shown
  useEffect(() => {
    if (viewMode !== 'detail') return;
    const top10 = scoredList.filter(({ score }) => score !== null).slice(0, 10);
    top10.forEach(({ s }) => {
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

      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between">
        <button type="button" onClick={() => navigate('/')}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        {batchLoading
          ? <span className="text-sm text-slate-400">扫描中… {batchProgress.done}/{batchProgress.total}</span>
          : <span className="text-sm text-slate-400">共 {total} 条序列 · 完成 {done}</span>}
      </div>

      {/* Progress bar */}
      {batchLoading && (
        <div className="w-full h-1 rounded-full bg-[#292929] overflow-hidden shrink-0">
          <div className="h-full bg-[#5D56C1] transition-all duration-300"
            style={{ width: `${total ? (batchProgress.done / total) * 100 : 0}%` }} />
        </div>
      )}

      {/* View toggle — centered, text-base */}
      <div className="shrink-0 flex justify-center">
        <div className="flex items-center rounded-lg bg-[#1F1F1F] p-0.5 text-base">
          <button type="button" onClick={() => setViewMode('compare')}
            className={`px-4 py-1.5 rounded-md transition-colors ${viewMode === 'compare' ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
            分布对比
          </button>
          <button type="button" onClick={() => setViewMode('detail')}
            className={`px-4 py-1.5 rounded-md transition-colors ${viewMode === 'detail' ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
            详情视图
          </button>
        </div>
      </div>

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
                {/* 表头 */}
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-xs text-neutral-500 w-14 shrink-0 pt-0.5">表头</span>
                  <div className="flex flex-wrap gap-1.5">
                    {allColumnGroups.map(g => {
                      const visible = !hiddenGroups.has(g.group);
                      return (
                        <button key={g.group} type="button"
                          onClick={() => setHiddenGroups(prev => {
                            const next = new Set(prev);
                            visible ? next.add(g.group) : next.delete(g.group);
                            return next;
                          })}
                          className={`px-2 py-0.5 rounded text-xs border transition-colors ${visible ? `${g.labelClass} border-current` : 'text-neutral-600 border-[#3a3a3a]'}`}>
                          {g.group}
                        </button>
                      );
                    })}
                  </div>
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
        const curIdx = detailList.findIndex(({ s }) => s.id === effectiveSelectedId);

        return (
          <div className="flex flex-col flex-1 min-h-0 gap-2">

            {/* Sequence switcher */}
            <div className="shrink-0 flex items-center gap-2 px-1">
              {/* Protein name + badges */}
              <h2 className="text-base font-bold text-slate-100 truncate min-w-0 flex-1">{selectedEntry?.s.name}</h2>
              {proteinType && (
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  isAntibody ? 'bg-blue-500/20 text-blue-300'
                  : proteinType === 'Peptide' ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-emerald-500/20 text-emerald-300'
                }`}>{proteinType}</span>
              )}
              {selectedEntry && recommendedIds.has(selectedEntry.s.id) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">Recommended</span>
              )}
              {/* Divider */}
              <div className="h-4 w-px bg-[#3a3a3a] shrink-0 mx-1" />
              {/* Sort toggle */}
              <button type="button"
                onClick={() => setDetailSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                title={detailSortOrder === 'asc' ? '当前：风险评分升序' : '当前：风险评分降序'}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-[#1F1F1F] border border-[#3a3a3a] text-slate-400 hover:text-slate-200 hover:border-[#555] transition-colors shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {detailSortOrder === 'asc'
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9M3 12h5m8 0l4-4m0 0l4 4m-4-4v12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9M3 12h5m8 4l4 4m0 0l4-4m-4 4V8" />
                  }
                </svg>
                排序
              </button>
              {/* Prev / counter / Next */}
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" disabled={curIdx <= 0}
                  onClick={() => setSelectedId(detailList[curIdx - 1].s.id)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs text-neutral-500 px-1">{curIdx + 1} / {detailList.length}</span>
                <button type="button" disabled={curIdx >= detailList.length - 1}
                  onClick={() => setSelectedId(detailList[curIdx + 1].s.id)}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <p className="text-sm text-slate-400">
                        {isTop10 ? '结构预测准备中…' : '该序列不在 Top 10 范围内'}
                      </p>
                      {!isTop10 && (
                        <button type="button"
                          onClick={() => {
                            startedFoldRef.current.add(effectiveSelectedId);
                            predictBatchStructure(effectiveSelectedId, selectedEntry?.s.sequence ?? '');
                          }}
                          className="px-4 py-2 rounded-lg bg-[#5D56C1] hover:bg-[#6e67d4] text-sm text-slate-50 transition-colors">
                          开始结构预测
                        </button>
                      )}
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
                  <ProteinViewer
                    pdbUrl={fold.pdbUrl ?? ''}
                    pdbFormat="pdb"
                    pdbText={fold.pdbText ?? ''}
                    selectedResidue={detailSelectedResidue}
                    proteinType={proteinType}
                  />
                </div>
              </div>

              {/* Right: scan results */}
              <div className="flex-1 rounded-2xl bg-[#292929] px-5 py-4 flex flex-col overflow-hidden min-w-0">
                <div className="shrink-0 pb-3 border-b border-[#333]">
                  <p className="text-sm text-slate-400">
                    序列长度：{selectedResult?.result?.sequence_length ?? '—'}，命中位点：{selectedResult?.result?.hotspots?.length ?? 0} 个
                  </p>
                </div>
                {selectedResult?.status === 'error' ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-red-400">
                    扫描失败：{selectedResult.error}
                  </div>
                ) : (
                  <HotspotList result={selectedResult?.result ?? null} />
                )}
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
