import { useState, useRef, useEffect, useCallback } from 'react';
import ProteinViewer from './ProteinViewer.jsx';

/* ── 三字母 → 单字母映射 ── */
const THREE_TO_ONE = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V'
};

/**
 * 从 PDB 文本中提取氨基酸序列。
 * 优先使用 SEQRES 记录；若无 SEQRES 则回退到 ATOM 记录（CA 原子去重）。
 * 默认取 H 链（重链），其次 L / A / 第一条链。
 */
const pickChain = (map) =>
  map.H || map.L || map.A || Object.values(map)[0];

/**
 * 根据文件名后缀判断结构格式（给 Molstar 用）
 */
function detectFormat(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  if (ext === 'cif' || ext === 'mmcif') return 'mmcif';
  return 'pdb';
}

/**
 * 从 PDB 文本提取氨基酸序列
 */
function extractSequenceFromPdb(text) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);

  // SEQRES
  const seqByChain = {};
  for (const line of lines) {
    if (!line.startsWith('SEQRES')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const chainId = parts[2];
    if (!seqByChain[chainId]) seqByChain[chainId] = [];
    for (const res of parts.slice(4)) {
      const aa = THREE_TO_ONE[res.toUpperCase()];
      if (aa) seqByChain[chainId].push(aa);
    }
  }
  if (Object.keys(seqByChain).length > 0) {
    const chain = pickChain(seqByChain);
    return chain ? chain.join('') : '';
  }

  // ATOM CA 去重
  const atomByChain = {};
  for (const line of lines) {
    if (!line.startsWith('ATOM')) continue;
    const atomName = line.substring(12, 16).trim();
    if (atomName !== 'CA') continue;
    const resName = line.substring(17, 20).trim();
    const chainId = line.substring(21, 22).trim() || '_';
    const resSeq = line.substring(22, 27).trim();
    const aa = THREE_TO_ONE[resName.toUpperCase()];
    if (!aa) continue;
    if (!atomByChain[chainId]) atomByChain[chainId] = new Map();
    if (!atomByChain[chainId].has(resSeq)) {
      atomByChain[chainId].set(resSeq, aa);
    }
  }
  if (Object.keys(atomByChain).length > 0) {
    const chain = pickChain(atomByChain);
    return chain ? [...chain.values()].join('') : '';
  }
  return '';
}

/* ── 序列可视化组件 ── */
function SequenceStrip({ sequence, hotspots, selectedResidue, onSelectResidue }) {
  if (!sequence) {
    return (
      <div className="text-[11px] text-slate-500">
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
        return 'text-red-400';
      case 'High':
        return 'text-red-300';
      case 'Medium':
        return 'text-amber-300';
      case 'Low':
        return 'text-emerald-300';
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
    const MIN_CELL = 10; // 每个残基最小宽度 (px)
    const PAD = 16;      // 容器左右 px-2 = 8*2
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

  const lines = [];
  for (let i = 0; i < seq.length; i += lineLength) {
    lines.push({ start: i, end: Math.min(i + lineLength, seq.length) });
  }

  return (
    <div className="w-full text-[11px] font-mono text-slate-300">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-200">序列视图</span>
        <div className="flex gap-2 text-[10px] text-slate-400">
          <span className="text-red-300">● 高风险</span>
          <span className="text-amber-300">● 中风险</span>
          <span className="text-emerald-300">● 低风险</span>
        </div>
      </div>
      <div ref={containerRef} className="border border-slate-700/60 rounded-lg px-2 py-2 bg-[#181818] space-y-1.5">
        {lines.map(({ start, end }) => {
          const count = end - start;
          const isFull = count === lineLength;
          const cellCls = isFull ? 'flex-1 min-w-0' : 'w-0 flex-none';
          // 不满行时用与满行相同的单元格宽度，通过 CSS calc 得出
          const cellStyle = isFull ? undefined : { width: `calc(100% / ${lineLength})` };
          return (
            <div key={start} className="space-y-0.5">
              {/* index row */}
              <div className="flex whitespace-nowrap text-[9px] text-slate-500">
                {Array.from({ length: count }).map((_, i) => {
                  const pos = start + i;
                  const label = (pos + 1) % 10 === 0 ? pos + 1 : '·';
                  return (
                    <span
                      key={pos}
                      className={`${cellCls} text-center`}
                      style={cellStyle}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
              {/* sequence row */}
              <div className="flex whitespace-nowrap">
                {Array.from(seq.slice(start, end)).map((aa, offset) => {
                  const idx = start + offset;
                  const info = perResidue[idx];
                  const isSelected = selectedResidue && selectedResidue - 1 === idx;
                  const baseCls = info ? riskToClass(info.risk) : 'text-slate-400';
                  const cls = isSelected
                    ? `${baseCls} bg-yellow-500/30 rounded-sm`
                    : baseCls;
                  const title = info
                    ? `${aa}${idx + 1} · ${info.rule || ''} · ${info.risk}`
                    : `${aa}${idx + 1}`;
                  return (
                    <span
                      key={idx}
                      className={`${cls} select-none ${cellCls} text-center cursor-pointer`}
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

/**
 * 从 mmCIF 文本提取氨基酸序列
 * 解析 _atom_site 表中的 CA 原子行
 */
function extractSequenceFromCif(text) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);

  // 找 _atom_site 的 loop_ 列定义
  let inAtomSite = false;
  const colNames = [];
  const dataRows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'loop_') {
      inAtomSite = false;
      colNames.length = 0;
      continue;
    }
    if (trimmed.startsWith('_atom_site.')) {
      inAtomSite = true;
      colNames.push(trimmed);
      continue;
    }
    if (inAtomSite && !trimmed.startsWith('_') && trimmed.length > 0 && trimmed !== '#') {
      if (trimmed.startsWith('loop_') || trimmed.startsWith('data_')) {
        inAtomSite = false;
        continue;
      }
      dataRows.push(trimmed);
    } else if (inAtomSite && (trimmed.startsWith('_') && !trimmed.startsWith('_atom_site.'))) {
      inAtomSite = false;
    }
  }

  if (colNames.length === 0 || dataRows.length === 0) return '';

  const colIndex = (name) => colNames.indexOf(name);
  const iGroup   = colIndex('_atom_site.group_PDB');
  const iAtom    = colIndex('_atom_site.label_atom_id');
  const iRes     = colIndex('_atom_site.label_comp_id');
  const iChain   = colIndex('_atom_site.auth_asym_id') >= 0
    ? colIndex('_atom_site.auth_asym_id')
    : colIndex('_atom_site.label_asym_id');
  const iSeq     = colIndex('_atom_site.auth_seq_id') >= 0
    ? colIndex('_atom_site.auth_seq_id')
    : colIndex('_atom_site.label_seq_id');

  if (iAtom < 0 || iRes < 0 || iChain < 0 || iSeq < 0) return '';

  const atomByChain = {};
  for (const row of dataRows) {
    const parts = row.split(/\s+/);
    if (iGroup >= 0 && parts[iGroup] !== 'ATOM') continue;
    if (parts[iAtom] !== 'CA') continue;
    const resName = parts[iRes];
    const chainId = parts[iChain] || '_';
    const resSeq  = parts[iSeq];
    const aa = THREE_TO_ONE[resName.toUpperCase()];
    if (!aa) continue;
    if (!atomByChain[chainId]) atomByChain[chainId] = new Map();
    if (!atomByChain[chainId].has(resSeq)) {
      atomByChain[chainId].set(resSeq, aa);
    }
  }

  if (Object.keys(atomByChain).length > 0) {
    const chain = pickChain(atomByChain);
    return chain ? [...chain.values()].join('') : '';
  }
  return '';
}

/**
 * 根据文件名自动选择解析方式
 */
function extractSequence(text, fileName) {
  const fmt = detectFormat(fileName);
  return fmt === 'mmcif'
    ? extractSequenceFromCif(text)
    : extractSequenceFromPdb(text);
}

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
  const [show3DMobile, setShow3DMobile] = useState(false);
  const [foldingStatus, setFoldingStatus] = useState(''); // '' | 'loading' | 'done' | 'error'
  const [foldingError, setFoldingError] = useState('');
  const fileInputRef = useRef(null);

  const groupOrder = [
    '1. 脱酰胺', '2. 氧化', '3. 异构化', '4. 糖基化',
    '5. 游离巯基', '6. 细胞粘附', '7. 裂解', '8. 蛋白水解',
    '9. 环化', '10. 糖基化终产物'
  ];

  const riskRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const API_BASE =
    import.meta?.env?.VITE_API_BASE_URL ||
    (import.meta.env.DEV ? 'http://localhost:8000' : '/api');

  const cleanSequence = (raw) =>
    raw.replace(/[\s\u3000]/g, '').toUpperCase();

  /* ── 调用后端扫描 ── */
  const runScan = async (rawSeq) => {
    setError('');
    setResult(null);

    const seq = cleanSequence(rawSeq || '');
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
        setError(`网络错误：无法连接到服务器 (${e.message})。\n请检查网络连接或稍后重试。`);
      } else {
        setError(e.message || '未知错误，请稍后重试。');
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── ESMFold 结构预测 ── */
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
      const resp = await fetch('https://api.esmatlas.com/foldSequence/v1/pdb/', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: seq,
      });
      if (!resp.ok) {
        throw new Error(`ESMFold 返回错误 [HTTP ${resp.status}]`);
      }
      const pdbContent = await resp.text();
      if (!pdbContent || !pdbContent.includes('ATOM')) {
        throw new Error('ESMFold 返回的结构数据无效');
      }
      // 释放旧的 blob URL
      if (pdbUrl) URL.revokeObjectURL(pdbUrl);
      const blob = new Blob([pdbContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setPdbText(pdbContent);
      setPdbFileName('predicted.pdb');
      setPdbFormat('pdb');
      setPdbUrl(url);
      setFoldingStatus('done');
    } catch (e) {
      setFoldingError(e.message || 'ESMFold 预测失败，请稍后重试。');
      setFoldingStatus('error');
    }
  };

  const handleScan = async (e) => {
    if (e) e.preventDefault();
    // 同时触发 hotspot 扫描和结构预测（如果没有已上传的 PDB）
    const scanPromise = runScan(sequence);
    if (!pdbUrl) {
      predictStructure(sequence);
    }
    await scanPromise;
  };

  /* ── PDB 上传 ── */
  const handlePdbUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 先读取并解析序列，再更新 UI 与 3D 结构，保证“上传即扫描”的顺序正确
    const url = URL.createObjectURL(file);
    const reader = new FileReader();

    reader.onload = (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      const fmt = detectFormat(file.name);
      const seqFromPdb = extractSequence(text, file.name);

      if (seqFromPdb) {
        // 1. 自动填入序列输入框
        setSequence(seqFromPdb);
        // 2. 立即触发一次扫描（无需用户再点按钮）
        runScan(seqFromPdb);
        // 3. 在序列就绪后再展示 3D 结构，保持视图与数据同步
        setPdbText(text);
        setPdbFileName(file.name);
        setPdbFormat(fmt);
        setPdbUrl(url);
      } else {
        // 解析失败：不更新 3D 视图，只给出提示
        URL.revokeObjectURL(url);
        setError('无法解析该 PDB 序列，请手动输入');
      }
    };

    reader.readAsText(file);
  };

  /* ── 清空 ── */
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
    setShow3DMobile(false);
    setFoldingStatus('');
    setFoldingError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleResidueSelectFromSequence = (residueNumber) => {
    setSelectedResidue(residueNumber);
    scrollToResidueInList(residueNumber);
  };

  const handleExport = () => {
    if (!result || !result.hotspots || result.hotspots.length === 0) {
      setError('当前没有可导出的扫描结果，请先完成一次扫描。');
      return;
    }

    const headers = [
      'Group',
      'RuleName',
      'Motif',
      'Regex',
      'Start',
      'End',
      'Region',
      'BaseRisk',
      'FinalRisk',
      'RSA',
      'Category'
    ];

    const rows = result.hotspots.map((h) => [
      `"${h.group ?? ''}"`,
      `"${h.rule_name ?? ''}"`,
      `"${h.motif ?? ''}"`,
      `"${h.regex ?? ''}"`,
      h.start,
      h.end,
      `"${h.region ?? ''}"`,
      `"${h.base_risk ?? ''}"`,
      `"${h.final_risk ?? ''}"`,
      (h.rsa ?? 0).toFixed(3),
      `"${h.category ?? ''}"`
    ]);

    const csvContent =
      headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

  return (
    <div className="h-screen bg-[#1F1F1F] text-slate-50 flex flex-col overflow-hidden">
      {/* ── 顶栏 ── */}
      <header className="shrink-0 px-6 py-4 border-b border-slate-800">
        <h1 className="text-2xl font-semibold tracking-tight">
          抗体 Hotspot 智能预测平台
        </h1>
      </header>

      {/* ── 主体区域（可滚动）── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── 顶部：输入区（全宽） ── */}
        <form onSubmit={handleScan} className="space-y-3 rounded-2xl bg-[#292929] px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-slate-300">
              抗体氨基酸序列
            </label>
            {result && (
              <p className="text-xs text-slate-500">
                长度 {result.sequence_length} · 命中 {result.hotspots?.length || 0}
              </p>
            )}
          </div>

          <textarea
            className="w-full h-28 rounded-xl bg-[#1F1F1F] border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none font-mono"
            placeholder="直接粘贴序列，或上传 PDB 文件自动提取"
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
          />

          {/* PDB 上传 + 按钮 */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-2 rounded-lg bg-[#363636] px-3 py-2 cursor-pointer hover:bg-[#404040] active:bg-[#333] transition-colors">
              <span className="text-slate-100">上传 PDB 文件</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdb,.ent,.cif,.mmcif"
                className="hidden"
                onChange={handlePdbUpload}
              />
            </label>
            {pdbFileName && (
              <span className="text-slate-400 truncate max-w-[180px]" title={pdbFileName}>
                {pdbFileName}
              </span>
            )}
            <div className="flex items-center gap-3 ml-auto">
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
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                清空
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 whitespace-pre-line">{error}</p>
          )}
        </form>

        {/* ── 下方：左 序列+3D · 右 结果 ── */}
        <div className="flex flex-col md:flex-row gap-4 min-h-[calc(100vh-180px)]">

          {/* 左侧：序列视图 + 3D 结构 */}
          <div className="hidden md:flex md:w-[55%] md:min-h-[960px] rounded-2xl bg-[#292929] px-4 py-4 flex-col gap-3">
            <SequenceStrip
              sequence={sequence}
              hotspots={result?.hotspots}
              selectedResidue={selectedResidue}
              onSelectResidue={handleResidueSelectFromSequence}
            />
            <div className="flex-1 rounded-xl overflow-hidden relative">
              {foldingStatus === 'loading' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#181818]/90 rounded-xl">
                  <div className="text-center space-y-3">
                    <div className="inline-block w-8 h-8 border-2 border-slate-500 border-t-cyan-400 rounded-full animate-spin" />
                    <p className="text-sm text-slate-300">结构预测中…预计需要 10-30 秒</p>
                    <p className="text-[11px] text-slate-500">由 ESMFold 提供预测服务</p>
                  </div>
                </div>
              )}
              {foldingStatus === 'error' && !pdbUrl && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#181818]/90 rounded-xl">
                  <p className="text-sm text-red-400 px-4 text-center">{foldingError}</p>
                </div>
              )}
              <ProteinViewer
                pdbUrl={pdbUrl}
                pdbFormat={pdbFormat}
                pdbText={pdbText}
                selectedResidue={selectedResidue}
              />
            </div>
          </div>

          {/* 移动端 3D 视图 */}
          {pdbUrl && (
            <div className="md:hidden">
              <button
                type="button"
                className="text-[11px] text-slate-300 underline mb-2"
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
                  />
                  <div className="h-[640px] rounded-2xl overflow-hidden">
                    <ProteinViewer
                      pdbUrl={pdbUrl}
                      pdbFormat={pdbFormat}
                      pdbText={pdbText}
                      selectedResidue={selectedResidue}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 右侧：扫描结果 */}
          <div className="flex-1 space-y-3 rounded-2xl bg-[#292929] px-5 py-5 md:min-h-[960px] md:max-h-[960px] md:overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium text-slate-100">扫描结果</h2>
              {result?.hotspots?.length > 0 && (
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center rounded-md bg-slate-800 px-3 py-1 text-[11px] text-slate-100 hover:bg-slate-700 transition-colors"
                >
                  导出 Excel
                </button>
              )}
            </div>

            {!result && !error && (
              <p className="text-sm text-slate-400">
                扫描结果将展示在这里，包括 NG / DG 以及 PRD 中其他 PTM Hotspot 规则的命中位点。
              </p>
            )}

            {result && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">
                  序列长度：{result.sequence_length}，命中位点：{result.hotspots?.length || 0} 个
                  （已按 RSA Mock=0.5 通过业务规则过滤）
                </p>

                <div className="rounded-xl bg-[#1F1F1F]">
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
                              {groupItems.map((h, idx) => {
                        const isSelected =
                          selectedResidue != null &&
                          selectedResidue - 1 >= (h.start ?? 0) &&
                          selectedResidue - 1 < (h.end ?? (h.start ?? 0) + 1);

                        // 使用全局索引来构造 id，方便 scrollToResidueInList 精确滚动
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
                                    onClick={() => setSelectedResidue(h.start + 1)}
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
                                      位点区间：{h.end - h.start === 1 ? h.start + 1 : `${h.start + 1} - ${h.end}`}
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
                              );})}
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

export default App;
