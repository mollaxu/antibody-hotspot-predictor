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

const TOP_OPTIONS = [
  { label: '全部', value: 0 },
  { label: 'Top 5', value: 5 },
  { label: 'Top 10', value: 10 },
];

export default function BatchResultsPage() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const { batchSequences, batchResults, batchLoading, batchProgress } = ctx;

  const [selectedId, setSelectedId] = useState(batchSequences?.[0]?.id ?? null);
  const [topN, setTopN] = useState(0); // 0 = 全部

  if (!batchSequences || batchSequences.length === 0) return <Navigate to="/" replace />;

  const done  = batchResults.filter(r => r.status === 'done').length;
  const total = batchSequences.length;

  // 给每条序列附上评分，按分数升序排列（未完成的排最后）
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

  // Top 5 推荐：评分最低的前 5 条（已完成）
  const recommendedIds = useMemo(() => {
    return new Set(
      scoredList.filter(({ score }) => score !== null).slice(0, 5).map(({ s }) => s.id)
    );
  }, [scoredList]);

  // 根据 topN 过滤显示的列表
  const displayList = useMemo(() => {
    if (topN === 0) return scoredList;
    const done = scoredList.filter(({ score }) => score !== null);
    return done.slice(0, topN);
  }, [scoredList, topN]);

  // 若当前选中项不在 displayList 中，自动切换到第一项
  const displayIds = new Set(displayList.map(({ s }) => s.id));
  const effectiveSelectedId = displayIds.has(selectedId) ? selectedId : (displayList[0]?.s.id ?? null);

  const selectedEntry = displayList.find(({ s }) => s.id === effectiveSelectedId);
  const selectedResult = selectedEntry?.r;
  const proteinType = selectedResult?.result?.protein_type;
  const isAntibody = proteinType === 'Antibody';

  return (
    <div className="flex-1 p-4 space-y-2 overflow-hidden flex flex-col">
      {/* 顶栏 */}
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

      {/* 进度条 */}
      {batchLoading && (
        <div className="w-full h-1 rounded-full bg-[#292929] overflow-hidden shrink-0">
          <div className="h-full bg-[#5D56C1] transition-all duration-300"
            style={{ width: `${total ? (batchProgress.done / total) * 100 : 0}%` }} />
        </div>
      )}

      {/* 左右布局 */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* 左侧：序列列表 */}
        <div className="w-[300px] shrink-0 rounded-2xl bg-[#292929] flex flex-col overflow-hidden">
          {/* 左侧头部 */}
          <div className="shrink-0 px-4 pt-4 pb-3 border-b border-[#333] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100">序列列表</h2>
              {/* Top N 切换 */}
              <div className="flex items-center rounded-lg bg-[#1F1F1F] p-0.5 text-xs">
                {TOP_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setTopN(opt.value)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${topN === opt.value ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-neutral-500">得分越低，代表该序列越稳定</p>
          </div>

          {/* 序列行 */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#333]">
            {displayList.map(({ s, r, score }, rank) => {
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

        {/* 右侧：扫描结果 */}
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
    </div>
  );
}
