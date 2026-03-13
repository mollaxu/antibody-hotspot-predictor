import { useState } from 'react';

function App() {
  const [sequence, setSequence] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const groupOrder = [
    '1. 脱酰胺',
    '2. 氧化',
    '3. 异构化',
    '4. 糖基化',
    '5. 游离巯基',
    '6. 细胞粘附',
    '7. 裂解',
    '8. 蛋白水解',
    '9. 环化',
    '10. 糖基化终产物'
  ];

  const riskRank = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3
  };

  const handleClear = () => {
    setSequence('');
    setError('');
    setResult(null);
  };

  const API_BASE =
    import.meta?.env?.VITE_API_BASE_URL || '/api';

  const cleanSequence = (raw) => {
    // 去除所有空白字符（空格、换行、制表符、全角空格等）
    return raw.replace(/[\s\u3000]/g, '').toUpperCase();
  };

  const handleScan = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setResult(null);

    const seq = cleanSequence(sequence);
    if (!seq) {
      setError('请输入抗体氨基酸序列。');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq })
      });

      if (!resp.ok) {
        let detail = '';
        try {
          const body = await resp.text();
          detail = body ? `\n响应内容：${body.slice(0, 200)}` : '';
        } catch (_) { /* ignore */ }
        throw new Error(`请求失败 [HTTP ${resp.status} ${resp.statusText}]${detail}`);
      }

      const data = await resp.json();
      setResult(data);
    } catch (e) {
      if (e.name === 'TypeError') {
        // fetch 本身抛出的网络错误（如 DNS 失败、CORS、断网等）
        setError(`网络错误：无法连接到服务器 (${e.message})。\n请检查网络连接或稍后重试。`);
      } else {
        setError(e.message || '未知错误，请稍后重试。');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1F1F1F] text-slate-50 flex items-start justify-center">
      <div className="w-full max-w-5xl px-6 py-8 space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          抗体 Hotspot 智能预测平台
        </h1>

        {/* 输入区域 */}
        <form onSubmit={handleScan} className="space-y-4 rounded-2xl bg-[#292929] px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">
              抗体氨基酸序列
            </label>
            {result && (
              <p className="text-xs text-slate-500">
                序列长度：{result.sequence_length}，命中位点：
                {result.hotspots?.length || 0} 个
              </p>
            )}
          </div>
            <textarea
              className="w-full h-40 rounded-xl bg-[#1F1F1F] border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none"
              placeholder="请输入序列"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-slate-50 transition-colors"
              >
                {loading ? '扫描中…' : '开始扫描'}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={loading && !sequence}
                className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                清空
              </button>
            </div>
            {error && (
              <p className="text-sm text-red-400 mt-2 whitespace-pre-line">
                {error}
              </p>
            )}
          </form>

        {/* 结果区域 */}
        <div className="space-y-3 rounded-2xl bg-[#292929] px-5 py-5">
          <h2 className="text-lg font-medium text-slate-100">扫描结果</h2>

          {!result && !error && (
            <p className="text-sm text-slate-400">
              扫描结果将展示在这里，包括 NG / DG 以及 PRD 中其他 PTM Hotspot 规则的命中位点。
            </p>
          )}

          {result && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                序列长度：{result.sequence_length}，命中位点：
                {result.hotspots?.length || 0} 个
                （已按 RSA Mock=0.5 通过业务规则过滤）
              </p>

              <div className="max-h-[520px] overflow-auto rounded-xl bg-[#1F1F1F]">
                {result.hotspots && result.hotspots.length > 0 ? (
                  <div className="divide-y divide-slate-800 text-sm">
                    {groupOrder.map((groupLabel) => {
                      const groupItems = result.hotspots
                        .filter((h) => h.group === groupLabel)
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
                            <h3 className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
                              {displayLabel}
                            </h3>
                            <span className="text-[10px] text-slate-500">
                              共 {groupItems.length} 个风险位点
                            </span>
                          </div>
                          <ul className="space-y-2">
                            {groupItems.map((h, idx) => (
                              <li
                                key={`${groupLabel}-${idx}-${h.start}-${h.end}`}
                                className="rounded-lg bg-[#292929] px-3 py-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-50 text-xs">
                            基序：{h.motif}
                          </div>
                                  <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] ${
                                      h.final_risk === 'High' || h.final_risk === 'Critical'
                                        ? 'bg-red-500/20 text-red-300'
                                        : h.final_risk === 'Medium'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : 'bg-emerald-500/20 text-emerald-300'
                                    }`}
                                  >
                                    {h.final_risk}
                                  </span>
                                </div>
                                <div className="mt-1 text-[11px] text-slate-400 space-x-2">
                                  <span className="font-semibold text-slate-100">
                                    位点区间：{h.start} - {h.end}
                                  </span>
                                  <span
                                    className={
                                      h.region && h.region.startsWith('CDR')
                                        ? 'text-red-300 font-semibold'
                                        : 'text-slate-400'
                                    }
                                  >
                                    | 区域：{h.region}
                                  </span>
                                  <span>| RSA：{(h.rsa * 100).toFixed(1)}%</span>
                                </div>
                                <div className="mt-1 text-[11px] text-slate-500">
                                  分类：{h.category}，正则：{h.regex}
                                </div>
                              </li>
                            ))}
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
                <p className="text-xs text-slate-500">
                  另有 {result.buried_filtered.length} 个命中位点因 RSA &lt; 5% 被归入“结构屏蔽清单”。
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

