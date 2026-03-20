import { useState, useEffect } from 'react';

const RISK_OPTIONS = ['High', 'Medium', 'Low'];

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
    const error = onAdd(group, m, pattern, risk);
    if (error) { setErr(error); return; }
    setMotif('');
  };

  return (
    <div className="mt-2.5 pt-2 border-t border-[#333] space-y-1.5">
      <div className="flex items-center gap-2">
        <input type="text" placeholder="新增基序（如：VF）" value={motif}
          onChange={e => setMotif(e.target.value)}
          className="flex-1 text-sm rounded bg-[#1F1F1F] border border-[#555555] text-slate-300 px-2 py-1 focus:outline-none focus:border-[#5D56C1] placeholder:text-slate-600 font-mono" />
        <select value={risk} onChange={e => setRisk(e.target.value)}
          className="text-sm rounded bg-[#1F1F1F] border border-[#555555] text-slate-300 px-1.5 py-1 cursor-pointer focus:outline-none focus:border-[#5D56C1]">
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

export default function RulesModal({ open, onClose, defaultRules, customRules, setCustomRules, userRules, setUserRules }) {
  const [editing, setEditing] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupError, setNewGroupError] = useState('');

  // Local copies — only committed to parent on "应用"
  const [localCustomRules, setLocalCustomRules] = useState({});
  const [localUserRules, setLocalUserRules]     = useState([]);

  // Reset local state every time the modal opens
  useEffect(() => {
    if (open) {
      setLocalCustomRules(customRules);
      setLocalUserRules(userRules);
      setEditing(false);
      setNewGroupName('');
      setNewGroupError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Derived display data (from local state)
  const defaultGroupSet = new Set(defaultRules.map(r => r.group));
  const allRulesForDisplay = [
    ...defaultRules.map(r => ({ ...r, isDefault: true })),
    ...localUserRules.map(r => ({ rule_name: r.id, group: r.group, motif: r.motif, risk: r.risk, enabled: r.enabled !== false, isDefault: false, id: r.id })),
  ];
  const groupedRules = allRulesForDisplay.reduce((acc, r) => {
    if (!acc[r.group]) acc[r.group] = [];
    acc[r.group].push(r);
    return acc;
  }, {});
  const defaultGroupNames = Object.keys(groupedRules).filter(g => defaultGroupSet.has(g));
  const userGroupNames    = Object.keys(groupedRules).filter(g => !defaultGroupSet.has(g));
  const groupNames = [...defaultGroupNames, ...userGroupNames];

  const isGroupCustomOnly = (group) => groupedRules[group].every(r => !r.isDefault);

  const isGroupEnabled = (group) =>
    groupedRules[group].some(r => {
      if (r.isDefault) return localCustomRules[r.rule_name]?.enabled !== false;
      return r.enabled !== false;
    });

  // ── Local handlers (modify local copies only) ──

  const toggleGroup = (group) => {
    const anyOn = isGroupEnabled(group);
    const defaultInGroup = groupedRules[group].filter(r => r.isDefault);
    if (defaultInGroup.length > 0) {
      setLocalCustomRules(prev => {
        const next = { ...prev };
        defaultInGroup.forEach(r => { next[r.rule_name] = { ...next[r.rule_name], enabled: !anyOn }; });
        return next;
      });
    }
    const userInGroup = groupedRules[group].filter(r => !r.isDefault);
    if (userInGroup.length > 0) {
      setLocalUserRules(prev => prev.map(r => r.group === group ? { ...r, enabled: !anyOn } : r));
    }
  };

  const toggleRule = (ruleName) => {
    setLocalCustomRules(prev => {
      const cur = prev[ruleName];
      return { ...prev, [ruleName]: { ...cur, enabled: cur?.enabled === false ? true : false } };
    });
  };

  const changeRisk = (ruleName, risk) => {
    setLocalCustomRules(prev => ({ ...prev, [ruleName]: { ...prev[ruleName], risk } }));
  };

  const toggleUserRule = (id) => {
    setLocalUserRules(prev => prev.map(r => r.id === id ? { ...r, enabled: r.enabled === false } : r));
  };

  const changeUserRisk = (id, risk) => {
    setLocalUserRules(prev => prev.map(r => r.id === id ? { ...r, risk } : r));
  };

  const deleteUserRule  = (id)    => setLocalUserRules(prev => prev.filter(r => r.id !== id));
  const deleteUserGroup = (group) => setLocalUserRules(prev => prev.filter(r => r.group !== group));

  const addMotifToGroup = (group, motif, pattern, risk) => {
    const existing = (groupedRules[group] || []).map(r => r.motif.toUpperCase());
    if (existing.includes(motif.toUpperCase())) return `该基序已存在于「${group}」中，请确认`;
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLocalUserRules(prev => [...prev, { id, group, motif, pattern, risk, enabled: true }]);
    return null;
  };

  const handleAddGroup = () => {
    setNewGroupError('');
    const name = newGroupName.trim();
    if (!name) { setNewGroupError('请输入风险类型名称'); return; }
    if (groupedRules[name]) { setNewGroupError(`「${name}」风险类型已存在`); return; }
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setLocalUserRules(prev => [...prev, { id, group: name, motif: '(待添加)', pattern: 'PLACEHOLDER_NEVER_MATCH_xyzzy', risk: 'Medium', enabled: true }]);
    setNewGroupName('');
  };

  // Commit local state → parent, then exit edit mode
  const handleApply = () => {
    setCustomRules(localCustomRules);
    setUserRules(localUserRules);
    setEditing(false);
  };

  // Discard local changes
  const handleClose = () => { onClose(); };

  // ── Rule row renderers ──

  const renderDefaultRule = (r) => {
    const cfg = localCustomRules[r.rule_name];
    const enabled = cfg?.enabled !== false;
    const risk = cfg?.risk || r.risk;
    return (
      <div key={r.rule_name} className="flex items-center gap-3">
        {editing && (
          <input type="checkbox" checked={enabled} onChange={() => toggleRule(r.rule_name)}
            className="w-3 h-3 rounded accent-[#5D56C1] cursor-pointer" />
        )}
        <span translate="no" className={`text-sm flex-1 font-mono ${enabled ? 'text-slate-300' : 'text-slate-500'}`}>{r.motif}</span>
        {editing
          ? <select value={risk} onChange={e => changeRisk(r.rule_name, e.target.value)}
              className="text-sm rounded bg-[#1F1F1F] border border-[#555555] text-slate-300 px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[#5D56C1]">
              {RISK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          : <RiskBadge risk={risk} />
        }
      </div>
    );
  };

  const renderUserRule = (r) => {
    const isPlaceholder = r.motif === '(待添加)';
    const enabled = r.enabled !== false;
    if (!editing && isPlaceholder) return null;
    return (
      <div key={r.id} className="flex items-center gap-3">
        {editing && !isPlaceholder && (
          <input type="checkbox" checked={enabled} onChange={() => toggleUserRule(r.id)}
            className="w-3 h-3 rounded accent-[#5D56C1] cursor-pointer" />
        )}
        <span translate="no" className={`text-sm flex-1 font-mono ${isPlaceholder ? 'text-slate-500 italic' : enabled ? 'text-slate-300' : 'text-slate-500'}`}>{r.motif}</span>
        {editing ? (
          <>
            {!isPlaceholder && (
              <select value={r.risk} onChange={e => changeUserRisk(r.id, e.target.value)}
                className="text-sm rounded bg-[#1F1F1F] border border-[#555555] text-slate-300 px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[#5D56C1]">
                {RISK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
            <button type="button" onClick={() => deleteUserRule(r.id)}
              className="text-slate-500 hover:text-red-400 transition-colors p-0.5" title="删除">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          !isPlaceholder && <RiskBadge risk={r.risk} />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative bg-[#1F1F1F] rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl border border-[#333]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#333]">
          <h2 className="text-base font-semibold text-slate-200">扫描规则配置</h2>
          <div className="flex items-center gap-3">
            <button type="button" onClick={editing ? handleApply : () => setEditing(true)}
              className="text-sm text-[#8b85e0] hover:text-[#a9a4f0] transition-colors">
              {editing ? '应用' : '编辑规则'}
            </button>
            <button type="button" onClick={handleClose}
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
                  {editing && (
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
                <div className={`mt-2 space-y-1.5 ${editing ? 'pl-5' : ''}`}>
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
                  className="flex-1 text-sm rounded bg-[#1F1F1F] border border-[#555555] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-[#5D56C1] placeholder:text-slate-600" />
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
}
