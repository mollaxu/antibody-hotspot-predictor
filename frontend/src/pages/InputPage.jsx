import { useRef, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { detectFormat, extractAllChains } from '../utils/pdb.js';

const RISK_OPTIONS = ['High', 'Medium', 'Low'];
// 与 ResultsPage 标签颜色一致
const RISK_BADGE = {
  Critical: 'bg-red-500/20 text-red-500',
  High:     'bg-red-500/20 text-red-400',
  Medium:   'bg-orange-500/20 text-orange-400',
  Low:      'bg-yellow-500/20 text-yellow-300',
};

function RiskBadge({ risk }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${RISK_BADGE[risk] || 'bg-slate-500/20 text-slate-400'}`}>
      {risk}
    </span>
  );
}

// 每个 group 内的行内添加基序表单
function InlineAddMotif({ group, onAdd }) {
  const [motif, setMotif] = useState('');
  const [risk, setRisk] = useState('Medium');
  const [err, setErr] = useState('');

  const handleAdd = () => {
    setErr('');
    const m = motif.trim();
    if (!m) { setErr('请输入基序'); return; }
    const parts = m.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) { setErr('仅支持单基序添加，请逐条输入'); return; }
    const pattern = parts[0];
    try { new RegExp(pattern); } catch { setErr('基序无法解析'); return; }
    // onAdd 返回错误信息则说明重名
    const error = onAdd(group, m, pattern, risk);
    if (error) { setErr(error); return; }
    setMotif('');
  };

  return (
    <div className="mt-2.5 pt-2 border-t border-[#333] space-y-1.5">
      <div className="flex items-center gap-2">
        <input type="text" placeholder="新增基序（如：VF）" value={motif}
          onChange={e => setMotif(e.target.value)}
          className="flex-1 text-sm rounded bg-[#1F1F1F] border border-[#3a3a3a] text-slate-300 px-2 py-1 focus:outline-none focus:border-[#5D56C1] placeholder:text-slate-600 font-mono" />
        <select value={risk} onChange={e => setRisk(e.target.value)}
          className="text-sm rounded bg-[#1F1F1F] border border-[#3a3a3a] text-slate-300 px-1.5 py-1 cursor-pointer focus:outline-none focus:border-[#5D56C1]">
          {RISK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
      <button type="button" onClick={handleAdd}
        className="text-sm text-[#8b85e0] hover:text-[#a9a4f0] transition-colors">
        + 添加基序
      </button>
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

export default function InputPage() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const pdbUploadedThisSession = useRef(false);
  const [enablePrediction, setEnablePrediction] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupError, setNewGroupError] = useState('');

  const {
    sequence, setSequence,
    loading, error, setError,
    pdbUrl, pdbFileName, setPdbFileName, setPdbFormat, setPdbUrl, setPdbText,
    setChainInfo,
    defaultRules, customRules, setCustomRules, userRules, setUserRules,
    runScan, predictStructure, cleanSequence,
    handleClear: parentClear,
  } = ctx;

  const allRulesForDisplay = [
    ...defaultRules.map(r => ({ ...r, isDefault: true })),
    ...userRules.map(r => ({ rule_name: r.id, group: r.group, motif: r.motif, risk: r.risk, enabled: r.enabled !== false, isDefault: false, id: r.id })),
  ];

  const defaultGroupSet = new Set(defaultRules.map(r => r.group));
  const groupedRules = allRulesForDisplay.reduce((acc, r) => {
    if (!acc[r.group]) acc[r.group] = [];
    acc[r.group].push(r);
    return acc;
  }, {});
  const defaultGroupNames = Object.keys(groupedRules).filter(g => defaultGroupSet.has(g));
  const userGroupNames = Object.keys(groupedRules).filter(g => !defaultGroupSet.has(g));
  const groupNames = [...defaultGroupNames, ...userGroupNames];

  const isGroupCustomOnly = (group) => groupedRules[group].every(r => !r.isDefault);

  const isGroupEnabled = (group) =>
    groupedRules[group].some(r => {
      if (r.isDefault) return customRules[r.rule_name]?.enabled;
      return r.enabled !== false;
    });

  const toggleGroup = (group) => {
    const anyOn = isGroupEnabled(group);
    // 切换默认规则
    const defaultInGroup = groupedRules[group].filter(r => r.isDefault);
    if (defaultInGroup.length > 0) {
      setCustomRules(prev => {
        const next = { ...prev };
        defaultInGroup.forEach(r => { next[r.rule_name] = { ...next[r.rule_name], enabled: !anyOn }; });
        return next;
      });
    }
    // 切换用户规则
    const userInGroup = groupedRules[group].filter(r => !r.isDefault);
    if (userInGroup.length > 0) {
      setUserRules(prev => prev.map(r => r.group === group ? { ...r, enabled: !anyOn } : r));
    }
  };

  const toggleRule = (ruleName) => {
    setCustomRules(prev => ({ ...prev, [ruleName]: { ...prev[ruleName], enabled: !prev[ruleName]?.enabled } }));
  };

  const changeRisk = (ruleName, risk) => {
    setCustomRules(prev => ({ ...prev, [ruleName]: { ...prev[ruleName], risk } }));
  };

  const toggleUserRule = (id) => {
    setUserRules(prev => prev.map(r => r.id === id ? { ...r, enabled: r.enabled === false ? true : false } : r));
  };

  const changeUserRisk = (id, risk) => {
    setUserRules(prev => prev.map(r => r.id === id ? { ...r, risk } : r));
  };

  const deleteUserRule = (id) => { setUserRules(prev => prev.filter(r => r.id !== id)); };
  const deleteUserGroup = (group) => { setUserRules(prev => prev.filter(r => r.group !== group)); };

  const addMotifToGroup = (group, motif, pattern, risk) => {
    // 重名校验（不区分大小写）：检查该 group 下所有规则（默认 + 用户）
    const existing = (groupedRules[group] || []).map(r => r.motif.toUpperCase());
    if (existing.includes(motif.toUpperCase())) return `该基序已存在于「${group}」中，请确认`;
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setUserRules(prev => [...prev, { id, group, motif, pattern, risk, enabled: true }]);
    return null;
  };

  const handleAddGroup = () => {
    setNewGroupError('');
    const name = newGroupName.trim();
    if (!name) { setNewGroupError('请输入风险类型名称'); return; }
    if (groupedRules[name]) { setNewGroupError(`「${name}」风险类型已存在`); return; }
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setUserRules(prev => [...prev, { id, group: name, motif: '(待添加)', pattern: 'PLACEHOLDER_NEVER_MATCH_xyzzy', risk: 'Medium', enabled: true }]);
    setNewGroupName('');
  };

  const handlePdbUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      const fmt = detectFormat(file.name);
      const { sequence: seqFromPdb, chains } = extractAllChains(text, file.name);
      if (seqFromPdb) {
        setSequence(seqFromPdb); setChainInfo(chains); setPdbText(text);
        setPdbFileName(file.name); setPdbFormat(fmt); setPdbUrl(url);
        pdbUploadedThisSession.current = true;
      } else { URL.revokeObjectURL(url); setError('无法解析该蛋白文件序列，请手动输入'); }
    };
    reader.readAsText(file);
  };

  const handleScan = async (e) => {
    if (e) e.preventDefault();
    const seq = cleanSequence(sequence || '');
    if (!seq) { setError('请输入氨基酸序列。'); return; }

    // 若本轮未主动上传 PDB，则清空上一轮残留的结构数据
    const clearedPdb = pdbUrl && !pdbUploadedThisSession.current;
    if (clearedPdb) {
      URL.revokeObjectURL(pdbUrl);
      setPdbUrl('');
      setPdbText('');
      setPdbFileName('');
      setPdbFormat('pdb');
      setChainInfo([]);
    }
    pdbUploadedThisSession.current = false;

    const scanPromise = runScan(sequence);
    if (enablePrediction && (!pdbUrl || clearedPdb)) predictStructure(sequence);
    await scanPromise;
    navigate('/results');
  };

  const handleClear = () => { parentClear(); if (fileInputRef.current) fileInputRef.current.value = ''; };

  // ── 渲染规则行 ──
  const renderDefaultRule = (r) => {
    const cfg = customRules[r.rule_name] || { enabled: true, risk: r.risk };
    if (!editing) {
      return (
        <div key={r.rule_name} className="flex items-center gap-3">
          <input type="checkbox" checked={cfg.enabled} onChange={() => toggleRule(r.rule_name)}
            className="w-3 h-3 rounded accent-[#5D56C1] cursor-pointer" />
          <span translate="no" className={`text-sm flex-1 font-mono ${cfg.enabled ? 'text-slate-300' : 'text-slate-500'}`}>{r.motif}</span>
          <RiskBadge risk={cfg.risk} />
        </div>
      );
    }
    return (
      <div key={r.rule_name} className="flex items-center gap-3">
        <span className="w-3 h-3" />
        <span translate="no" className="text-sm flex-1 font-mono text-slate-300">{r.motif}</span>
        <select value={cfg.risk} onChange={e => changeRisk(r.rule_name, e.target.value)}
          className="text-sm rounded bg-[#1F1F1F] border border-[#3a3a3a] text-slate-300 px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[#5D56C1]">
          {RISK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    );
  };

  const renderUserRule = (r) => {
    const isPlaceholder = r.motif === '(待添加)';
    const enabled = r.enabled !== false;
    if (!editing && isPlaceholder) return null;
    if (!editing) {
      return (
        <div key={r.id} className="flex items-center gap-3">
          <input type="checkbox" checked={enabled} onChange={() => toggleUserRule(r.id)}
            className="w-3 h-3 rounded accent-[#5D56C1] cursor-pointer" />
          <span translate="no" className={`text-sm flex-1 font-mono ${enabled ? 'text-slate-300' : 'text-slate-500'}`}>{r.motif}</span>
          <RiskBadge risk={r.risk} />
        </div>
      );
    }
    return (
      <div key={r.id} className="flex items-center gap-3">
        <span className="w-3 h-3" />
        <span translate="no" className={`text-sm flex-1 font-mono ${isPlaceholder ? 'text-slate-500 italic' : 'text-slate-300'}`}>{r.motif}</span>
        {!isPlaceholder && (
          <select value={r.risk} onChange={e => changeUserRisk(r.id, e.target.value)}
            className="text-sm rounded bg-[#1F1F1F] border border-[#3a3a3a] text-slate-300 px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[#5D56C1]">
            {RISK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        )}
        <button type="button" onClick={() => deleteUserRule(r.id)}
          className="text-slate-500 hover:text-red-400 transition-colors p-0.5" title="删除">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  };

  // ── 弹窗内容 ──
  const renderModal = () => {
    if (!modalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* 遮罩 */}
        <div className="absolute inset-0 bg-black/60" onClick={() => { setModalOpen(false); setEditing(false); }} />
        {/* 弹窗 */}
        <div className="relative bg-[#1F1F1F] rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl border border-[#333]">
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]">
            <h2 className="text-base font-semibold text-slate-200">扫描规则配置</h2>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setEditing(v => !v)}
                className="text-sm text-[#8b85e0] hover:text-[#a9a4f0] transition-colors">
                {editing ? '应用' : '编辑规则'}
              </button>
              <button type="button" onClick={() => { setModalOpen(false); setEditing(false); }}
                className="text-slate-500 hover:text-slate-300 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* 编辑提示 */}
          {editing && (
            <div className="px-5 pt-3">
              <p className="text-sm text-amber-500/80 leading-relaxed">
                自定义规则存储在当前浏览器中，清除浏览器缓存将重置为默认规则。
              </p>
            </div>
          )}

          {/* 规则列表 */}
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
            {groupNames.map(group => {
              const rules = groupedRules[group];
              const customOnly = isGroupCustomOnly(group);
              return (
                <div key={group} className="rounded-lg bg-[#252525] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {!editing && (
                      <input type="checkbox" checked={isGroupEnabled(group)} onChange={() => toggleGroup(group)}
                        className="w-3.5 h-3.5 rounded accent-[#5D56C1] cursor-pointer" />
                    )}
                    <span className="text-base font-medium text-slate-200 flex-1">{group}</span>
                    {editing && customOnly && (
                      <button type="button" onClick={() => deleteUserGroup(group)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-0.5" title="删除该风险类型">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5 pl-5">
                    {rules.map(r => r.isDefault ? renderDefaultRule(r) : renderUserRule(r))}
                  </div>
                  {editing && (
                    <div className="pl-5">
                      <InlineAddMotif group={group} onAdd={addMotifToGroup} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* 新增风险类型 */}
            {editing && (
              <div className="rounded-lg bg-[#252525] px-3 py-2.5 space-y-2">
                <p className="text-sm font-medium text-slate-400">新增风险类型</p>
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="风险类型名称（如：聚集）"
                    value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                    className="flex-1 text-sm rounded bg-[#1F1F1F] border border-[#3a3a3a] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-[#5D56C1] placeholder:text-slate-600" />
                  <button type="button" onClick={handleAddGroup}
                    className="text-sm rounded bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] text-white px-3 py-1 transition-colors whitespace-nowrap">
                    创建
                  </button>
                </div>
                {newGroupError && <p className="text-xs text-red-400">{newGroupError}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-5 py-8">
        <form onSubmit={handleScan} className="space-y-4 rounded-2xl bg-[#292929] px-6 py-6">
          <div><label className="text-base font-bold text-slate-300">氨基酸序列</label></div>
          <textarea
            className="w-full h-36 rounded-xl bg-[#1F1F1F] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5D56C1] resize-none font-mono"
            placeholder="请输入序列，或上传蛋白文件自动提取"
            value={sequence} onChange={(e) => setSequence(e.target.value)} />

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2 rounded-lg bg-[#363636] px-3 py-2 cursor-pointer hover:bg-[#404040] active:bg-[#333] transition-colors">
              <span className="text-sm text-slate-100">上传蛋白文件</span>
              <input ref={fileInputRef} type="file" accept=".pdb,.ent,.cif,.mmcif" className="hidden" onChange={handlePdbUpload} />
            </label>
            {pdbFileName && <span className="text-slate-400 truncate max-w-[180px]" title={pdbFileName}>{pdbFileName}</span>}
          </div>

          <div className="rounded-xl bg-[#1F1F1F] px-4 py-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm text-slate-200">结构预测</p>
                <p className="text-sm text-neutral-500 mt-0.5">使用 ESMFold 自动预测 3D 结构（序列 ≤ 400 残基）</p>
              </div>
              <div className={`relative w-10 h-5 rounded-full transition-colors ${enablePrediction ? 'bg-[#5D56C1]' : 'bg-slate-600'}`}
                onClick={() => setEnablePrediction(v => !v)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enablePrediction ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>

          {/* 扫描规则 — 查看按钮 */}
          {defaultRules.length > 0 && (
            <div className="rounded-xl bg-[#1F1F1F] px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">扫描规则</p>
                  <p className="text-sm text-neutral-500 mt-0.5">查看和配置风险类型、基序及风险等级</p>
                </div>
                <button type="button" onClick={() => setModalOpen(true)}
                  className="text-sm rounded-lg bg-[#363636] hover:bg-[#404040] px-3 py-1.5 text-slate-200 transition-colors">
                  查看
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading}
              className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-slate-50 transition-colors">
              {loading ? '扫描中…' : '开始扫描'}
            </button>
            <button type="button" onClick={handleClear} disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-[#363636] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-[#404040] disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              清空
            </button>
          </div>

          {error && <p className="text-sm text-red-400 whitespace-pre-line">{error}</p>}
        </form>
      </div>

      {/* 规则弹窗 */}
      {renderModal()}
    </div>
  );
}
