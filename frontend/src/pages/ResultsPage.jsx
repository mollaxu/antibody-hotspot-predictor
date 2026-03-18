import { useState } from 'react';
import { useOutletContext, Navigate, useNavigate } from 'react-router-dom';
import SequenceStrip from '../components/SequenceStrip.jsx';
import ProteinViewer from '../ProteinViewer.jsx';

export default function ResultsPage() {
  const ctx = useOutletContext();
  const navigate = useNavigate();

  const {
    sequence, result,
    pdbUrl, pdbText, pdbFormat, pdbFileName,
    selectedResidue, setSelectedResidue,
    chainInfo, foldingStatus, foldingError,
    proteinType, isAntibody,
    groupOrder, riskRank, getChainAt, activeFilterCount,
    filterRegion, setFilterRegion,
    filterGroup, setFilterGroup,
    filterRisk, setFilterRisk,
    filterChains, setFilterChains,
    filterRsaMin, setFilterRsaMin, filterRsaMax, setFilterRsaMax,
    handleExport, handleResidueSelectFromSequence,
  } = ctx;

  const [show3DMobile, setShow3DMobile] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  if (!result) return <Navigate to="/" replace />;

  return (
    <div className="flex-1 p-4 space-y-2 overflow-hidden flex flex-col">
      {/* 返回按钮 */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors self-start"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </button>

      {/* ── 下方：左 序列+3D · 右 结果 ── */}
      <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">

        {/* 左侧：序列视图 + 3D 结构 */}
        <div className="hidden md:flex md:w-[55%] rounded-2xl bg-[#292929] px-4 py-4 flex-col gap-3 overflow-hidden">
          <SequenceStrip
            sequence={sequence}
            hotspots={result?.hotspots}
            selectedResidue={selectedResidue}
            onSelectResidue={handleResidueSelectFromSequence}
            chainInfo={chainInfo}
          />
          <div className="flex-1 rounded-xl overflow-hidden relative">
            {foldingStatus === 'loading' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#181818]/90 rounded-xl">
                <div className="text-center space-y-3">
                  <div className="inline-block w-8 h-8 border-2 border-slate-500 border-t-cyan-400 rounded-full animate-spin" />
                  <p className="text-sm text-slate-300">结构预测中…预计需要 10-30 秒</p>
                  <p className="text-xs text-neutral-500">由 ESMFold 提供预测服务</p>
                </div>
              </div>
            )}
            {foldingStatus === 'error' && !pdbUrl && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#181818]/90 rounded-xl">
                <p className="text-sm text-red-400 px-4 text-center">{foldingError}</p>
              </div>
            )}
            {foldingStatus === 'done' && foldingError && (
              <div className="absolute top-2 left-2 right-2 z-10">
                <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-1.5">
                  ⚠ {foldingError}
                </p>
              </div>
            )}
            <ProteinViewer
              pdbUrl={pdbUrl}
              pdbFormat={pdbFormat}
              pdbText={pdbText}
              selectedResidue={selectedResidue}
              proteinType={proteinType}
            />
          </div>
        </div>

        {/* 移动端 3D 视图 */}
        {pdbUrl && (
          <div className="md:hidden">
            <button
              type="button"
              className="text-xs text-slate-300 underline mb-2"
              onClick={() => setShow3DMobile((v) => !v)}
            >
              {show3DMobile ? '收起 3D' : '查看 3D 结构'}
            </button>
            {show3DMobile && (
              <div className="space-y-2">
                <SequenceStrip
                  sequence={sequence}
                  hotspots={result?.hotspots}
                  selectedResidue={selectedResidue}
                  onSelectResidue={handleResidueSelectFromSequence}
                  chainInfo={chainInfo}
                />
                <div className="h-[640px] rounded-2xl overflow-hidden">
                  <ProteinViewer
                    pdbUrl={pdbUrl}
                    pdbFormat={pdbFormat}
                    pdbText={pdbText}
                    selectedResidue={selectedResidue}
                    proteinType={proteinType}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 右侧：扫描结果 */}
        <div className="flex-1 flex flex-col rounded-2xl bg-[#292929] px-5 py-5 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">扫描结果</h2>
              {proteinType && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isAntibody ? 'bg-blue-500/20 text-blue-300'
                  : proteinType === 'Peptide' ? 'bg-purple-500/20 text-purple-300'
                  : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {proteinType}
                </span>
              )}
            </div>
            {result?.hotspots?.length > 0 && (
              <div className="flex items-center gap-2 relative">
                {/* 筛选按钮 */}
                <button
                  type="button"
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeFilterCount > 0
                      ? 'bg-[#5D56C1]/20 text-[#a5a0f3] ring-1 ring-[#5D56C1]/40'
                      : 'bg-[#1F1F1F] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>

                {/* 导出按钮 */}
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center justify-center rounded-lg bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] px-4 py-2 text-sm font-medium text-slate-50 transition-colors"
                >
                  导出 Excel
                </button>

                {/* 筛选弹窗 */}
                {filterOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-96 rounded-xl bg-[#1F1F1F] p-5 space-y-5 shadow-xl shadow-black/40 max-h-[80vh] overflow-y-auto">

                      {/* 链 */}
                      {chainInfo.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-neutral-400">链</span>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {chainInfo.map((c) => {
                              const checked = filterChains.length === 0 || filterChains.includes(c.id);
                              return (
                                <label key={c.id} className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-slate-100">
                                  <input type="checkbox" checked={checked}
                                    onChange={() => {
                                      if (filterChains.length === 0) {
                                        setFilterChains(chainInfo.filter(ch => ch.id !== c.id).map(ch => ch.id));
                                      } else if (filterChains.includes(c.id)) {
                                        const next = filterChains.filter(id => id !== c.id);
                                        setFilterChains(next.length === 0 ? [] : next);
                                      } else {
                                        const next = [...filterChains, c.id];
                                        setFilterChains(next.length === chainInfo.length ? [] : next);
                                      }
                                    }}
                                    className="w-3.5 h-3.5 rounded accent-[#5D56C1]" />
                                  Chain {c.id}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 类别（多选） */}
                      <div className="space-y-2">
                        <span className="text-xs font-medium text-neutral-400">类别 {filterGroup.length > 0 && <span className="text-[#8b85e0]">({filterGroup.length})</span>}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[...groupOrder, ...(result?.hotspots || []).map(h => h.group).filter(g => !groupOrder.includes(g)).filter((g, i, a) => a.indexOf(g) === i)].map((g) => {
                            const active = filterGroup.includes(g);
                            return (
                              <button key={g} type="button"
                                onClick={() => setFilterGroup(prev => active ? prev.filter(x => x !== g) : [...prev, g])}
                                className={`px-2 py-1 rounded-md text-xs transition-colors ${active ? 'bg-[#5D56C1] text-slate-50' : 'bg-[#292929] text-slate-400 hover:text-slate-200'}`}>
                                {g}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 风险（多选） */}
                      <div className="space-y-2">
                        <span className="text-xs font-medium text-neutral-400">风险等级 {filterRisk.length > 0 && <span className="text-[#8b85e0]">({filterRisk.length})</span>}</span>
                        <div className="flex gap-1.5">
                          {[
                            { value: 'Critical', label: 'Critical', color: 'bg-red-500/20 text-red-500 border-red-500/30' },
                            { value: 'High', label: 'High', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
                            { value: 'Medium', label: 'Medium', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
                            { value: 'Low', label: 'Low', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
                          ].map(({ value, label, color }) => {
                            const active = filterRisk.includes(value);
                            return (
                              <button key={value} type="button"
                                onClick={() => setFilterRisk(prev => active ? prev.filter(x => x !== value) : [...prev, value])}
                                className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${active ? 'bg-[#5D56C1] text-slate-50 border-[#5D56C1]' : `${color} border`}`}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 区域 */}
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
                              <button key={value} type="button" onClick={() => setFilterRegion(value)}
                                className={`flex-1 py-1.5 rounded-md text-center transition-colors ${filterRegion === value ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* RSA 滑块 */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-neutral-400">RSA</span>
                          <span className="text-xs text-slate-300 font-mono">{filterRsaMin}% – {filterRsaMax}%</span>
                        </div>
                        <div className="relative h-7">
                          <div className="absolute top-2 left-0 right-0 h-2 rounded-full bg-[#292929] overflow-hidden">
                            <div className="absolute h-full bg-red-500/60" style={{ left: '0%', width: '5%' }} />
                            <div className="absolute h-full bg-orange-500/50" style={{ left: '5%', width: '15%' }} />
                            <div className="absolute h-full bg-emerald-500/50" style={{ left: '20%', width: '80%' }} />
                          </div>
                          <div className="absolute top-2 h-2 rounded-full bg-[#5D56C1]/60"
                            style={{ left: `${filterRsaMin}%`, width: `${filterRsaMax - filterRsaMin}%` }} />
                          <input type="range" min={0} max={100} step={1} value={filterRsaMin}
                            onChange={e => { const v = Number(e.target.value); if (v <= filterRsaMax) setFilterRsaMin(v); }}
                            className="absolute top-0 left-0 w-full h-7 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#5D56C1] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1F1F1F] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20" />
                          <input type="range" min={0} max={100} step={1} value={filterRsaMax}
                            onChange={e => { const v = Number(e.target.value); if (v >= filterRsaMin) setFilterRsaMax(v); }}
                            className="absolute top-0 left-0 w-full h-7 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#5D56C1] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#1F1F1F] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20" />
                        </div>
                        <div className="flex gap-1.5">
                          {[
                            { label: '深埋 <5%', min: 0, max: 5 },
                            { label: '部分 5-20%', min: 5, max: 20 },
                            { label: '暴露 >20%', min: 20, max: 100 },
                            { label: '全部', min: 0, max: 100 },
                          ].map(p => (
                            <button key={p.label} type="button"
                              onClick={() => { setFilterRsaMin(p.min); setFilterRsaMax(p.max); }}
                              className={`flex-1 px-1 py-1 rounded-md text-[11px] transition-colors ${
                                filterRsaMin === p.min && filterRsaMax === p.max
                                  ? 'bg-[#5D56C1] text-slate-50'
                                  : 'bg-[#292929] text-slate-400 hover:text-slate-200'
                              }`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2 pt-1">
                        <button type="button" onClick={() => setFilterOpen(false)}
                          className="flex-1 px-3 py-2 rounded-lg bg-[#5D56C1] text-xs text-slate-50 hover:bg-[#6d66d4] transition-colors">
                          确定
                        </button>
                        <button type="button"
                          onClick={() => { setFilterRegion('all'); setFilterGroup([]); setFilterRisk([]); setFilterChains([]); setFilterRsaMin(0); setFilterRsaMax(100); }}
                          className="flex-1 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-[#292929] transition-colors"
                        >
                          清空筛选
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {result && (
            <p className="shrink-0 text-sm text-slate-400 pb-2">
              序列长度：{result.sequence_length}，命中位点：{result.hotspots?.length || 0} 个
            </p>
          )}

          <div className="flex-1 overflow-y-auto">
          {result && (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#1F1F1F]">
                {result.hotspots && result.hotspots.length > 0 ? (
                  <div className="text-sm">
                    {[...groupOrder, ...(result.hotspots || []).map(h => h.group).filter(g => !groupOrder.includes(g)).filter((g, i, a) => a.indexOf(g) === i)]
                      .filter((g) => filterGroup.length === 0 || filterGroup.includes(g))
                      .map((groupLabel) => {
                      const groupItems = result.hotspots
                        .filter((h) => h.group === groupLabel)
                        .filter((h) => {
                          if (filterRegion === 'all') return true;
                          if (filterRegion === 'cdr') return h.region && h.region.startsWith('CDR');
                          if (filterRegion === 'fr')  return h.region && h.region.startsWith('FR');
                          if (filterRegion === 'fc')  return h.region === 'Fc';
                          return true;
                        })
                        .filter((h) => filterRisk.length === 0 || filterRisk.includes(h.final_risk))
                        .filter((h) => filterChains.length === 0 || filterChains.includes(getChainAt(h.start)))
                        .filter((h) => {
                          if (filterRsaMin === 0 && filterRsaMax === 100) return true;
                          const rsa = h.rsa;
                          if (rsa == null || rsa < 0) return filterRsaMin === 0;
                          const pct = rsa * 100;
                          return pct >= filterRsaMin && pct <= filterRsaMax;
                        })
                        .sort((a, b) => {
                          const ra = riskRank[a.final_risk] ?? 99;
                          const rb = riskRank[b.final_risk] ?? 99;
                          if (ra !== rb) return ra - rb;
                          return a.start - b.start;
                        });

                      if (!groupItems.length) return null;
                      const displayLabel = groupLabel.replace(/^\d+\.\s*/, '');

                      return (
                        <div key={groupLabel} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold tracking-wide text-slate-300 uppercase">
                              {displayLabel}
                            </h3>
                            <span className="text-sm text-neutral-500">
                              共 {groupItems.length} 个风险位点
                            </span>
                          </div>
                          <ul className="space-y-2">
                            {groupItems.map((h, idx) => {
                              const isSelected =
                                selectedResidue != null &&
                                selectedResidue - 1 >= (h.start ?? 0) &&
                                selectedResidue - 1 < (h.end ?? (h.start ?? 0) + 1);

                              const globalIdx = result.hotspots.indexOf(h);
                              const itemId = `hotspot-${h.start ?? 0}-${h.end ?? 0}-${globalIdx}`;

                              return (
                                <li
                                  key={`${groupLabel}-${idx}-${h.start}-${h.end}`}
                                  id={itemId}
                                  className={`rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-[#3b3b3b] ring-1 ring-[#5D56C1]'
                                      : 'bg-[#292929] hover:bg-[#333333]'
                                  }`}
                                  onClick={() => setSelectedResidue((prev) => prev === h.start + 1 ? null : h.start + 1)}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold text-slate-50 text-sm">
                                      基序：<span translate="no">{h.motif}</span>
                                    </div>
                                    <span
                                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${
                                        h.final_risk === 'Critical'
                                          ? 'bg-red-500/20 text-red-500'
                                          : h.final_risk === 'High'
                                          ? 'bg-red-500/20 text-red-400'
                                          : h.final_risk === 'Medium'
                                          ? 'bg-orange-500/20 text-orange-400'
                                          : 'bg-yellow-500/20 text-yellow-300'
                                      }`}
                                    >
                                      {h.final_risk}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-sm text-slate-400 space-x-2">
                                    {chainInfo.length > 0 && getChainAt(h.start) && (
                                      <span className="text-cyan-300">
                                        Chain {getChainAt(h.start)}
                                      </span>
                                    )}
                                    <span className="text-slate-100">
                                      {chainInfo.length > 0 && getChainAt(h.start) ? '| ' : ''}位点区间：{h.end - h.start === 1 ? h.start + 1 : `${h.start + 1} - ${h.end}`}
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
                  <div className="px-4 py-6 text-sm text-slate-400">
                    未检测到任何符合规则的 Hotspot 基序。
                  </div>
                )}
              </div>

              {result.buried_filtered && result.buried_filtered.length > 0 && (
                <p className="text-sm text-neutral-500">
                  另有 {result.buried_filtered.length} 个命中位点因 RSA &lt; 5% 被归入"结构屏蔽清单"。
                </p>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
