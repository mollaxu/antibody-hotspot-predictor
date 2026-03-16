import { useState, useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { extractAllChainsFromPdb, extractAllChains, detectFormat } from './utils/pdb.js';

const API_BASE =
  import.meta?.env?.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

const groupOrder = [
  '1. 脱酰胺', '2. 氧化', '3. 异构化', '4. 糖基化',
  '5. 游离巯基', '6. 细胞粘附', '7. 裂解', '8. 蛋白水解',
  '9. 环化', '10. 糖基化终产物'
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
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterRisk, setFilterRisk] = useState('all');
  const [filterChains, setFilterChains] = useState([]);

  const proteinType = result?.protein_type || null;
  const isAntibody = proteinType === 'Antibody';
  const isResultsPage = useLocation().pathname === '/results';

  const activeFilterCount = [filterRegion, filterGroup, filterRisk].filter(v => v !== 'all').length + (filterChains.length > 0 ? 1 : 0);

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

    const seq = cleanSequence(rawSeq || '');
    if (!seq) {
      setError('请输入氨基酸序列。');
      return;
    }

    if (chainInfo.length === 0) {
      setChainInfo([{ id: 'A', start: 0, end: seq.length }]);
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq, pdb_text: pdbText || null })
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

  const rescanWithPdb = async (seq, pdbContent) => {
    try {
      const resp = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: seq, pdb_text: pdbContent })
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
    setFilterGroup('all');
    setFilterRisk('all');
    setFilterChains([]);
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
