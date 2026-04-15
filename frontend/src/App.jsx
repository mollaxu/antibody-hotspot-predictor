import { useState, useRef, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { extractAllChainsFromPdb, extractAllChains, detectFormat } from './utils/pdb.js';

const API_BASE =
  import.meta?.env?.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

const groupOrder = [
  '脱酰胺', '氧化', '异构化', '糖基化',
  '游离巯基', '细胞粘附', '裂解', '蛋白水解',
  '环化', '羟基化', '赖氨酸糖基化', '糖基化终产物'
];

const riskRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function App() {
  const [sequence, setSequence] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [pdbUrl, setPdbUrl] = useState('');
  const [pdbText, setPdbText] = useState('');
  const [pdbFileName, setPdbFileName] = useState('');
  const [pdbFormat, setPdbFormat] = useState('pdb');
  const [selectedResidue, setSelectedResidue] = useState(null);
  const [chainInfo, setChainInfo] = useState([]);
  const [foldingStatus, setFoldingStatus] = useState('');
  const [foldingError, setFoldingError] = useState('');
  const [filterRegion, setFilterRegion] = useState('all');
  const [filterGroup, setFilterGroup] = useState(new Set()); // empty = 全部，有值 = 隐藏这些组
  const [filterRisk, setFilterRisk] = useState([]);     // [] = 全部
  const [filterChains, setFilterChains] = useState([]);
  const [filterRsaMin, setFilterRsaMin] = useState(0);
  const [filterRsaMax, setFilterRsaMax] = useState(100);

  // 批量扫描
  const [batchSequences, setBatchSequences] = useState([]);   // [{id, name, sequence}]
  const [batchResults, setBatchResults] = useState([]);       // [{id, name, sequence, result, status, error}]
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // 自定义扫描规则
  const [defaultRules, setDefaultRules] = useState([]);       // 从后端拉取的默认规则
  const [customRules, setCustomRules] = useState({});          // 用户自定义覆盖
  const [userRules, setUserRules] = useState([]);              // 用户新增的规则
  const [rulesReady, setRulesReady] = useState(false);         // 规则是否初始化完毕

  // 启动时从后端拉取默认规则，并合并 localStorage 存储
  useEffect(() => {
    fetch(`${API_BASE}/rules`)
      .then(r => r.json())
      .then(rules => {
        setDefaultRules(rules);
        // 从 localStorage 加载用户配置
        const savedCustom = localStorage.getItem('hotspot_customRules');
        const savedUser = localStorage.getItem('hotspot_userRules');
        if (savedCustom) {
          try {
            const parsed = JSON.parse(savedCustom);
            // 确保所有默认规则都有对应条目
            const merged = {};
            rules.forEach(r => {
              merged[r.rule_name] = parsed[r.rule_name] || { enabled: true, risk: r.risk };
            });
            setCustomRules(merged);
          } catch { setCustomRules(Object.fromEntries(rules.map(r => [r.rule_name, { enabled: true, risk: r.risk }]))); }
        } else {
          setCustomRules(Object.fromEntries(rules.map(r => [r.rule_name, { enabled: true, risk: r.risk }])));
        }
        if (savedUser) {
          try { setUserRules(JSON.parse(savedUser)); } catch { /* ignore */ }
        }
        setRulesReady(true);
      })
      .catch(() => {});
  }, []);

  // 规则变更时持久化到 localStorage
  useEffect(() => {
    if (!rulesReady) return;
    localStorage.setItem('hotspot_customRules', JSON.stringify(customRules));
  }, [customRules, rulesReady]);

  useEffect(() => {
    if (!rulesReady) return;
    localStorage.setItem('hotspot_userRules', JSON.stringify(userRules));
  }, [userRules, rulesReady]);

  const proteinType = result?.protein_type || null;
  const isAntibody = proteinType === 'Antibody';
  const isResultsPage = ['/results', '/batch-results'].includes(useLocation().pathname);

  const rsaFiltered = filterRsaMin > 0 || filterRsaMax < 100;
  const activeFilterCount = (filterRegion !== 'all' ? 1 : 0) + (filterGroup.size > 0 ? 1 : 0) + (filterRisk.length > 0 ? 1 : 0) + (filterChains.length > 0 ? 1 : 0) + (rsaFiltered ? 1 : 0);

  const getChainAt = (pos) => {
    for (const c of chainInfo) {
      if (pos >= c.start && pos < c.end) return c.id;
    }
    return null;
  };

  const cleanSequence = (raw) => {
    const noHeader = raw.replace(/^>.*$/gm, '');
    return noHeader.replace(/[^A-Za-z]/g, '').toUpperCase();
  };

  const runScan = async (rawSeq) => {
    setError('');
    setResult(null);
    setFilterGroup(new Set());
    setFilterRisk([]);
    setFilterRegion('all');
    setFilterChains([]);
    setFilterRsaMin(0);
    setFilterRsaMax(100);

    const seq = cleanSequence(rawSeq || '');
    if (!seq) {
      setError('请输入氨基酸序列。');
      return;
    }

    if (chainInfo.length === 0) {
      setChainInfo([{ id: 'A', start: 0, end: seq.length }]);
    }

    // 构建自定义规则参数
    const disabled_rules = Object.entries(customRules)
      .filter(([, v]) => !v.enabled)
      .map(([k]) => k);
    const risk_overrides = {};
    const defaultRiskMap = {};
    defaultRules.forEach(r => { defaultRiskMap[r.rule_name] = r.risk; });
    Object.entries(customRules).forEach(([k, v]) => {
      if (v.enabled && v.risk !== defaultRiskMap[k]) risk_overrides[k] = v.risk;
    });

    const scanPayload = {
      sequence: seq,
      pdb_text: pdbText || null,
      disabled_rules: disabled_rules.length > 0 ? disabled_rules : null,
      risk_overrides: Object.keys(risk_overrides).length > 0 ? risk_overrides : null,
      extra_rules: userRules.filter(r => r.enabled !== false && r.motif !== '(待添加)').length > 0
        ? userRules.filter(r => r.enabled !== false && r.motif !== '(待添加)').map(r => ({ group: r.group, motif: r.motif, pattern: r.pattern, risk: r.risk }))
        : null,
    };
    console.log('[DEBUG] scan payload:', JSON.stringify(scanPayload, null, 2));

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanPayload)
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
        setError(`网络错误：无法连接到服务器 (${e.message})。\n请检查网络连接或稍后重试。`);
      } else {
        setError(e.message || '未知错误，请稍后重试。');
      }
    } finally {
      setLoading(false);
    }
  };

  const runBatchScan = async (sequences) => {
    if (!sequences || sequences.length === 0) return;
    setBatchLoading(true);
    setBatchResults([]);
    setBatchProgress({ done: 0, total: sequences.length });

    const dr = Object.entries(customRules).filter(([, v]) => !v.enabled).map(([k]) => k);
    const ro = {};
    const drm = {};
    defaultRules.forEach(r => { drm[r.rule_name] = r.risk; });
    Object.entries(customRules).forEach(([k, v]) => {
      if (v.enabled && v.risk !== drm[k]) ro[k] = v.risk;
    });
    const er = userRules.filter(r => r.enabled !== false && r.motif !== '(待添加)')
      .map(r => ({ group: r.group, motif: r.motif, pattern: r.pattern, risk: r.risk }));

    const accumulated = [];
    for (let i = 0; i < sequences.length; i++) {
      const s = sequences[i];
      const seq = s.sequence.replace(/[^A-Za-z]/g, '').toUpperCase();
      try {
        const resp = await fetch(`${API_BASE}/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sequence: seq,
            pdb_text: s.pdbText || null,
            disabled_rules: dr.length > 0 ? dr : null,
            risk_overrides: Object.keys(ro).length > 0 ? ro : null,
            extra_rules: er.length > 0 ? er : null,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          accumulated.push({ ...s, result: data, status: 'done', error: null });
        } else {
          accumulated.push({ ...s, result: null, status: 'error', error: `HTTP ${resp.status}` });
        }
      } catch (e) {
        accumulated.push({ ...s, result: null, status: 'error', error: e.message });
      }
      setBatchProgress({ done: i + 1, total: sequences.length });
      setBatchResults([...accumulated]);
    }
    setBatchLoading(false);
  };

  const rescanWithPdb = async (seq, pdbContent) => {
    try {
      // 构建自定义规则参数（与 runScan 一致）
      const dr = Object.entries(customRules).filter(([, v]) => !v.enabled).map(([k]) => k);
      const ro = {};
      const drm = {};
      defaultRules.forEach(r => { drm[r.rule_name] = r.risk; });
      Object.entries(customRules).forEach(([k, v]) => {
        if (v.enabled && v.risk !== drm[k]) ro[k] = v.risk;
      });
      const er = userRules.filter(r => r.enabled !== false && r.motif !== '(待添加)');

      const resp = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence: seq,
          pdb_text: pdbContent,
          disabled_rules: dr.length > 0 ? dr : null,
          risk_overrides: Object.keys(ro).length > 0 ? ro : null,
          extra_rules: er.length > 0 ? er.map(r => ({ group: r.group, motif: r.motif, pattern: r.pattern, risk: r.risk })) : null,
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        setResult(data);
      }
    } catch (_) { /* 静默失败，保留之前的结果 */ }
  };

  const predictStructure = async (rawSeq) => {
    const seq = cleanSequence(rawSeq || '');
    if (!seq) return;
    if (seq.length > 400) {
      setFoldingError('序列超过 400 残基，ESMFold 暂不支持，请上传 PDB 文件。');
      setFoldingStatus('error');
      return;
    }

    setFoldingStatus('loading');
    setFoldingError('');
    try {
      const resp = await fetch(`${API_BASE}/fold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq }),
      });
      if (!resp.ok) {
        let detail = '';
        try {
          const body = await resp.json();
          detail = body.detail ? `，${body.detail}` : '';
        } catch (_) { /* ignore */ }
        throw new Error(`结构预测失败 [HTTP ${resp.status}]${detail}`);
      }
      const data = await resp.json();
      const pdbContent = data.pdb;
      if (!pdbContent || !pdbContent.includes('ATOM')) {
        throw new Error('ESMFold 返回的结构数据无效');
      }
      if (data.warning) {
        setFoldingError(data.warning);
      }
      const { chains } = extractAllChainsFromPdb(pdbContent);
      setChainInfo(chains);
      if (pdbUrl) URL.revokeObjectURL(pdbUrl);
      const blob = new Blob([pdbContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setPdbText(pdbContent);
      setPdbFileName('predicted.pdb');
      setPdbFormat('pdb');
      setPdbUrl(url);
      setFoldingStatus('done');
      // 结构就绪后用真实 RSA 重新扫描
      rescanWithPdb(seq, pdbContent);
    } catch (e) {
      setFoldingError(e.message || 'ESMFold 预测失败，请稍后重试。');
      setFoldingStatus('error');
    }
  };

  const handleClear = () => {
    setSequence('');
    setError('');
    setResult(null);
    if (pdbUrl) URL.revokeObjectURL(pdbUrl);
    setPdbUrl('');
    setPdbText('');
    setPdbFileName('');
    setPdbFormat('pdb');
    setSelectedResidue(null);
    setChainInfo([]);
    setFoldingStatus('');
    setFoldingError('');
    setFilterRegion('all');
    setFilterGroup(new Set());
    setFilterRisk([]);
    setFilterChains([]);
    setFilterRsaMin(0);
    setFilterRsaMax(100);
  };

  const scrollToResidueInList = (residueNumber) => {
    if (!result || !result.hotspots || !Number.isInteger(residueNumber)) return;
    const zeroBased = residueNumber - 1;
    let targetId = null;
    result.hotspots.forEach((h, globalIdx) => {
      const start = h.start ?? 0;
      const end = h.end ?? start + 1;
      if (zeroBased >= start && zeroBased < end && targetId === null) {
        targetId = `hotspot-${start}-${end}-${globalIdx}`;
      }
    });
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleResidueSelectFromSequence = (residueNumber) => {
    if (selectedResidue === residueNumber) {
      setSelectedResidue(null);
    } else {
      setSelectedResidue(residueNumber);
      scrollToResidueInList(residueNumber);
    }
  };

  const handleExport = () => {
    if (!result || !result.hotspots || result.hotspots.length === 0) {
      setError('当前没有可导出的扫描结果，请先完成一次扫描。');
      return;
    }

    const headers = ['RuleName', 'Motif', 'Regex', 'Start', 'End', 'Region', 'BaseRisk', 'FinalRisk', 'RSA'];

    const sortedHotspots = [...result.hotspots].sort((a, b) => {
      const ga = groupOrder.indexOf(a.group);
      const gb = groupOrder.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      return a.start - b.start;
    });

    const rows = sortedHotspots.map((h) => [
      `"${h.rule_name ?? ''}"`,
      `"${h.motif ?? ''}"`,
      `"${h.regex ?? ''}"`,
      h.start,
      h.end,
      `"${h.region ?? ''}"`,
      `"${h.base_risk ?? ''}"`,
      `"${h.final_risk ?? ''}"`,
      (h.rsa ?? 0).toFixed(3)
    ]);

    const csvContent = headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `hotspot_scan_${ts}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const ctx = {
    sequence, setSequence,
    loading, error, setError,
    result,
    pdbUrl, setPdbUrl, pdbText, setPdbText, pdbFormat, setPdbFormat, pdbFileName, setPdbFileName,
    selectedResidue, setSelectedResidue,
    chainInfo, setChainInfo,
    foldingStatus, foldingError,
    proteinType, isAntibody,
    groupOrder, riskRank,
    getChainAt, activeFilterCount,
    filterRegion, setFilterRegion,
    filterGroup, setFilterGroup,
    filterRisk, setFilterRisk,
    filterChains, setFilterChains,
    filterRsaMin, setFilterRsaMin, filterRsaMax, setFilterRsaMax,
    defaultRules, customRules, setCustomRules, userRules, setUserRules,
    batchSequences, setBatchSequences,
    batchResults, setBatchResults,
    batchLoading, batchProgress,
    runBatchScan,
    cleanSequence, runScan, predictStructure,
    handleClear, handleExport, handleResidueSelectFromSequence,
  };

  return (
    <div className="h-screen bg-[#1F1F1F] text-slate-50 flex flex-col overflow-hidden">
      {/* ── 顶栏（仅输入页显示） ── */}
      {!isResultsPage && (
        <header className="shrink-0 px-6 pt-16 pb-4 flex items-center justify-center">
          <h1 className="text-[40px] font-semibold tracking-tight">
            可开发性风险点预测平台
          </h1>
        </header>
      )}

      <Outlet context={ctx} />
    </div>
  );
}

export default App;
