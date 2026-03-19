import { useState, useRef, useEffect } from 'react';

export default function SequenceStrip({ sequence, hotspots, selectedResidue, onSelectResidue, chainInfo = [] }) {
  if (!sequence) {
    return (
      <div className="text-xs text-neutral-500">
        上传 PDB 或输入序列后，这里将以颜色标记潜在 Hotspot 残基。
      </div>
    );
  }

  const seq = sequence.replace(/[\s\u3000]/g, '').toUpperCase();
  if (!seq) {
    return null;
  }

  const riskRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const perResidue = Array.from({ length: seq.length }, () => null);

  if (Array.isArray(hotspots)) {
    for (const h of hotspots) {
      const start = Math.max(0, h.start ?? 0);
      const end = Math.min(seq.length, h.end ?? start + 1);
      const risk = h.final_risk || h.base_risk || 'Medium';
      const rank = riskRank[risk] ?? 99;
      for (let i = start; i < end; i += 1) {
        const prev = perResidue[i];
        if (!prev || (rank < (prev.rank ?? 99))) {
          perResidue[i] = {
            rank,
            risk,
            rule: h.rule_name,
            category: h.category
          };
        }
      }
    }
  }

  const riskToClass = (risk) => {
    switch (risk) {
      case 'Critical':
        return 'text-red-500';
      case 'High':
        return 'text-red-400';
      case 'Medium':
        return 'text-orange-400';
      case 'Low':
        return 'text-yellow-300';
      default:
        return 'text-slate-300';
    }
  };

  // 自适应：根据容器宽度动态计算每行残基数
  const containerRef = useRef(null);
  const [lineLength, setLineLength] = useState(50);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const MIN_CELL = 10;
    const PAD = 16;
    const calc = () => {
      const w = el.clientWidth - PAD;
      const count = Math.max(10, Math.floor(w / MIN_CELL));
      setLineLength(count);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 构建行：在链边界处强制断行
  const chainBreaks = new Set(chainInfo.filter(c => c.start > 0).map(c => c.start));
  const lines = [];
  let i = 0;
  while (i < seq.length) {
    let lineEnd = Math.min(i + lineLength, seq.length);
    for (let p = i + 1; p < lineEnd; p++) {
      if (chainBreaks.has(p)) {
        lineEnd = p;
        break;
      }
    }
    lines.push({ start: i, end: lineEnd });
    i = lineEnd;
  }

  // 链配色
  const CHAIN_COLORS = ['text-cyan-400', 'text-orange-400', 'text-pink-400', 'text-lime-400', 'text-violet-400'];
  const chainColorMap = {};
  chainInfo.forEach((c, idx) => { chainColorMap[c.id] = CHAIN_COLORS[idx % CHAIN_COLORS.length]; });

  const getChainId = (pos) => {
    for (const c of chainInfo) {
      if (pos >= c.start && pos < c.end) return c.id;
    }
    return null;
  };

  const getChainBoundariesInRange = (start, end) => {
    const boundaries = [];
    for (const c of chainInfo) {
      if (c.start >= start && c.start < end) {
        boundaries.push({ pos: c.start - start, id: c.id });
      }
    }
    return boundaries;
  };

  return (
    <div className="w-full text-xs font-mono text-slate-300">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-slate-200">序列视图</span>
          {chainInfo.length > 0 && (
            <span className="text-xs text-neutral-500">
              {chainInfo.map((c) => (
                <span key={c.id} className={`${chainColorMap[c.id]} mr-1.5`}>Chain {c.id}</span>
              ))}
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs text-slate-400">
          {Array.isArray(hotspots) && hotspots.some(h => (h.final_risk || h.base_risk) === 'Critical') && (
            <span className="text-red-500">● Critical</span>
          )}
          <span className="text-red-400">● High</span>
          <span className="text-orange-400">● Medium</span>
          <span className="text-yellow-300">● Low</span>
        </div>
      </div>
      <div ref={containerRef} className="rounded-lg px-2 py-2 bg-[#181818] space-y-1.5 max-h-[190px] overflow-y-auto">
        {lines.map(({ start, end }) => {
          const count = end - start;
          const isFull = count === lineLength;
          const cellCls = isFull ? 'flex-1 min-w-0' : 'w-0 flex-none';
          const cellStyle = isFull ? undefined : { width: `calc(100% / ${lineLength})` };
          const boundaries = chainInfo.length > 0 ? getChainBoundariesInRange(start, end) : [];
          const boundarySet = new Set(boundaries.map(b => b.pos));
          return (
            <div key={start} className="space-y-0.5">
              {boundaries.length > 0 && (
                <div className="flex whitespace-nowrap text-[9px]">
                  {Array.from({ length: count }).map((_, i) => {
                    const b = boundaries.find(b => b.pos === i);
                    const chainId = b ? b.id : null;
                    return (
                      <span
                        key={i}
                        className={`${cellCls} text-center ${chainId ? (chainColorMap[chainId] || 'text-slate-400') + ' font-bold' : ''}`}
                        style={cellStyle}
                      >
                        {chainId ? `Chain${chainId}` : ''}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex whitespace-nowrap text-[9px] text-neutral-500">
                {Array.from({ length: count }).map((_, i) => {
                  const pos = start + i;
                  const label = (pos + 1) % 10 === 0 ? pos + 1 : '·';
                  return (
                    <span key={pos} className={`${cellCls} text-center`} style={cellStyle}>{label}</span>
                  );
                })}
              </div>
              <div className="flex whitespace-nowrap">
                {Array.from(seq.slice(start, end)).map((aa, offset) => {
                  const idx = start + offset;
                  const info = perResidue[idx];
                  const isSelected = selectedResidue && selectedResidue - 1 === idx;
                  const baseCls = info ? riskToClass(info.risk) : 'text-slate-400';
                  const cls = isSelected ? `${baseCls} bg-yellow-500/30 rounded-sm` : baseCls;
                  const chainId = chainInfo.length > 1 ? getChainId(idx) : null;
                  const chainLabel = chainId ? `Chain ${chainId} · ` : '';
                  const title = info
                    ? `${chainLabel}${aa}${idx + 1} · ${info.rule || ''} · ${info.risk}`
                    : `${chainLabel}${aa}${idx + 1}`;
                  const borderCls = '';
                  return (
                    <span
                      key={idx}
                      className={`${cls} select-none ${cellCls} text-center cursor-pointer ${borderCls}`}
                      style={cellStyle}
                      title={title}
                      onClick={() => onSelectResidue && onSelectResidue(idx + 1)}
                    >
                      {aa}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
