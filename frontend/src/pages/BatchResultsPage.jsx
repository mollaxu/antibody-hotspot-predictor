import { useState, useMemo } from 'react';
import { useOutletContext, Navigate, useNavigate } from 'react-router-dom';

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

// ─── ComparisonTable ───────────────────────────────────────────────────────

function ComparisonTable({ displayList, recommendedIds }) {
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
    <div className="flex-1 overflow-auto rounded-2xl bg-[#292929]">
      <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
        <thead className="sticky top-0 z-10">
          {/* Row 1: group headers */}
          <tr>
            <th rowSpan={2}
              className="sticky left-0 z-20 bg-[#1F1F1F] px-4 py-3 text-left text-sm font-bold text-slate-200 border-b border-r border-[#3a3a3a] whitespace-nowrap"
              style={{ minWidth: 200, width: 200 }}>
              序列 / SEQUENCE
            </th>
            <th rowSpan={2}
              className="sticky z-20 bg-[#1F1F1F] px-3 py-3 text-center text-sm font-bold text-slate-200 border-b border-r border-[#3a3a3a] whitespace-nowrap"
              style={{ left: 200, minWidth: 64, width: 64 }}>
              得分
            </th>
            {COLUMN_GROUPS.map(g => (
              <th key={g.group} colSpan={g.motifs.length}
                className={`px-2 py-2 text-center font-bold border-b border-r border-[#3a3a3a] ${g.thClass} ${g.labelClass}`}>
                {g.groupEn}({g.group})
              </th>
            ))}
          </tr>
          {/* Row 2: motif sub-headers */}
          <tr>
            {COLUMN_GROUPS.map(g =>
              g.motifs.map((m, mi) => (
                <th key={m.ruleName}
                  className={`px-3 py-1.5 text-center font-mono font-semibold border-b border-[#3a3a3a] ${mi === g.motifs.length - 1 ? 'border-r' : ''} ${g.thClass} ${cellRiskColor[m.risk]}`}
                  style={{ minWidth: 44 }}>
                  <span translate="no">{m.key}</span>
                </th>
              ))
            )}
          </tr>
        </thead>

        <tbody>
          {/* Reference row: Antibody CDR */}
          <tr className="bg-[#1a2438]">
            <td className="sticky left-0 bg-[#1a2438] px-4 py-2 border-b border-r border-[#3a3a3a] whitespace-nowrap" style={{ width: 200 }}>
              <div className="text-[10px] text-slate-500 mb-0.5">参考频率</div>
              <span className="text-slate-300 font-medium">Antibody CDR</span>
            </td>
            <td className="sticky bg-[#1a2438] px-3 py-2 text-center border-b border-r border-[#3a3a3a] text-slate-500"
              style={{ left: 200 }}>—</td>
            {COLUMN_GROUPS.map(g =>
              g.motifs.map((m, mi) => {
                const freq = g.cdrFreq[mi];
                return (
                  <td key={m.ruleName}
                    className={`px-2 py-2 text-center border-b ${mi === g.motifs.length - 1 ? 'border-r' : ''} border-[#3a3a3a] text-slate-400`}>
                    {freq !== null && freq !== undefined ? `${freq}%` : '—'}
                  </td>
                );
              })
            )}
          </tr>

          {/* Reference row: Germline CDR */}
          <tr className="bg-[#1a2438]">
            <td className="sticky left-0 bg-[#1a2438] px-4 py-2 border-b border-r border-[#3a3a3a] whitespace-nowrap" style={{ width: 200 }}>
              <div className="text-[10px] text-slate-500 mb-0.5">参考频率</div>
              <span className="text-slate-300 font-medium">Germline CDR</span>
            </td>
            <td className="sticky bg-[#1a2438] px-3 py-2 text-center border-b border-r border-[#3a3a3a] text-slate-500"
              style={{ left: 200 }}>—</td>
            {COLUMN_GROUPS.map(g =>
              g.motifs.map((m, mi) => {
                const freq = g.germFreq[mi];
                return (
                  <td key={m.ruleName}
                    className={`px-2 py-2 text-center border-b ${mi === g.motifs.length - 1 ? 'border-r' : ''} border-[#3a3a3a] text-slate-400`}>
                    {freq !== null && freq !== undefined ? `${freq}%` : '—'}
                  </td>
                );
              })
            )}
          </tr>

          {/* Divider */}
          <tr><td colSpan={2 + COLUMN_GROUPS.reduce((s, g) => s + g.motifs.length, 0)} className="h-px bg-[#444]" /></tr>

          {/* Data rows */}
          {displayList.map(({ s, r, score }) => {
            const isRecommended = recommendedIds.has(s.id);
            const counts = matrix[s.id] || {};
            const isPending = r?.status !== 'done' && r?.status !== 'error';
            const isError = r?.status === 'error';
            const rowBg = isRecommended ? 'bg-emerald-900/15' : '';
            const stickyBg = isRecommended ? 'bg-emerald-900/25' : 'bg-[#292929]';

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
                {COLUMN_GROUPS.map(g =>
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
  const [topN, setTopN] = useState(0);
  const [viewMode, setViewMode] = useState('compare'); // 'compare' | 'detail'

  if (!batchSequences || batchSequences.length === 0) return <Navigate to="/" replace />;

  const done  = batchResults.filter(r => r.status === 'done').length;
  const total = batchSequences.length;

  // Attach scores, sort ascending (pending last)
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

  // Apply Top N filter
  const displayList = useMemo(() => {
    if (topN === 0) return scoredList;
    return scoredList.filter(({ score }) => score !== null).slice(0, topN);
  }, [scoredList, topN]);

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

      {/* View toggle + Top N */}
      <div className="shrink-0 flex items-center justify-between">
        {/* View mode tabs */}
        <div className="flex items-center rounded-lg bg-[#1F1F1F] p-0.5 text-xs">
          <button type="button" onClick={() => setViewMode('compare')}
            className={`px-3 py-1.5 rounded-md transition-colors ${viewMode === 'compare' ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
            分布对比
          </button>
          <button type="button" onClick={() => setViewMode('detail')}
            className={`px-3 py-1.5 rounded-md transition-colors ${viewMode === 'detail' ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
            详情视图
          </button>
        </div>
        {/* Top N toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">得分越低，代表该序列越稳定</span>
          <div className="flex items-center rounded-lg bg-[#1F1F1F] p-0.5 text-xs">
            {TOP_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => setTopN(opt.value)}
                className={`px-2.5 py-1 rounded-md transition-colors ${topN === opt.value ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Compare view ── */}
      {viewMode === 'compare' && (
        <ComparisonTable displayList={displayList} recommendedIds={recommendedIds} />
      )}

      {/* ── Detail view ── */}
      {viewMode === 'detail' && (
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left: sequence list */}
          <div className="w-[300px] shrink-0 rounded-2xl bg-[#292929] flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#333] space-y-1">
              <h2 className="text-base font-bold text-slate-100">序列列表</h2>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#333]">
              {displayList.map(({ s, r, score }) => {
                const isRecommended = recommendedIds.has(s.id);
                const isActive = s.id === effectiveSelectedId;
                const risk = r?.status === 'done' ? topRisk(r.result) : null;

                return (
                  <button key={s.id} type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      isActive
                        ? isRecommended ? 'bg-emerald-900/40' : 'bg-[#3b3b3b]'
                        : isRecommended ? 'bg-emerald-900/20 hover:bg-emerald-900/30' : 'hover:bg-[#333]'
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-200 truncate flex-1" title={s.name}>{s.name}</span>
                      {isRecommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 shrink-0">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                      <span>{s.sequence.length} aa</span>
                      <div className="flex items-center gap-2">
                        {risk && <span className={riskColor[risk]}>{risk}</span>}
                        {score !== null
                          ? <span className="text-slate-400">得分 <span className="text-slate-200 font-mono">{score}</span></span>
                          : r?.status === 'error'
                            ? <span className="text-red-400">失败</span>
                            : <span className="text-neutral-600">等待</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: scan result detail */}
          <div className="flex-1 rounded-2xl bg-[#292929] px-5 py-4 flex flex-col overflow-hidden min-w-0">
            <div className="shrink-0 flex items-center gap-2 pb-3 border-b border-[#333]">
              <h2 className="text-base font-bold text-slate-100 truncate">{selectedEntry?.s.name}</h2>
              {proteinType && (
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  isAntibody ? 'bg-blue-500/20 text-blue-300'
                  : proteinType === 'Peptide' ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-emerald-500/20 text-emerald-300'
                }`}>{proteinType}</span>
              )}
              {selectedEntry && recommendedIds.has(selectedEntry.s.id) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                  Recommended
                </span>
              )}
              {selectedEntry?.score !== null && selectedEntry?.score !== undefined && (
                <span className="ml-auto text-sm text-slate-400 shrink-0">
                  风险得分：<span className="text-slate-100 font-mono font-semibold">{selectedEntry.score}</span>
                </span>
              )}
            </div>

            {selectedResult?.result && (
              <p className="shrink-0 text-sm text-slate-400 py-2">
                序列长度：{selectedResult.result.sequence_length}，命中位点：{selectedResult.result.hotspots?.length || 0} 个
              </p>
            )}

            {selectedResult?.status === 'error' ? (
              <div className="flex-1 flex items-center justify-center text-sm text-red-400">
                扫描失败：{selectedResult.error}
              </div>
            ) : (
              <HotspotList result={selectedResult?.result ?? null} />
            )}
          </div>

        </div>
      )}
    </div>
  );
}
