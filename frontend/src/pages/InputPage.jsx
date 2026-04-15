import { useRef, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { detectFormat, extractAllChains } from '../utils/pdb.js';
import { parseSequenceFile } from '../utils/sequenceParser.js';
import RulesModal from '../components/RulesModal.jsx';

export default function InputPage() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const pdbUploadedThisSession = useRef(false);
  const batchFileInputRef = useRef(null);
  const [enablePrediction, setEnablePrediction] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  // 批量模式
  const [inputMode, setInputMode] = useState('single'); // 'single' | 'batch'
  const [batchFileName, setBatchFileName] = useState('');
  const [batchParseError, setBatchParseError] = useState('');

  const {
    sequence, setSequence,
    loading, error, setError,
    pdbUrl, pdbFileName, setPdbFileName, setPdbFormat, setPdbUrl, setPdbText,
    setChainInfo,
    defaultRules, customRules, setCustomRules, userRules, setUserRules,
    batchSequences, setBatchSequences, batchLoading, batchProgress,
    runScan, predictStructure, cleanSequence, runBatchScan,
    handleClear: parentClear,
  } = ctx;

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

  const handleBatchFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBatchParseError('');
    setBatchFileName(file.name);
    const { sequences, error } = await parseSequenceFile(file);
    if (error) {
      setBatchParseError(error);
      setBatchSequences([]);
    } else {
      setBatchSequences(sequences);
    }
    if (batchFileInputRef.current) batchFileInputRef.current.value = '';
  };

  const handleBatchScan = async () => {
    if (!batchSequences.length || batchLoading) return;
    await runBatchScan(batchSequences);
    navigate('/batch-results');
  };

  const handleBatchClear = () => {
    setBatchSequences([]);
    setBatchFileName('');
    setBatchParseError('');
  };


  return (
    <div className="flex-1 overflow-y-auto p-4 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-5 py-8">

        {/* ── 模式切换 ── */}
        <div className="flex items-center rounded-lg bg-[#292929] p-1 text-sm mx-auto w-fit">
          {[{ value: 'single', label: '单条序列' }, { value: 'batch', label: '批量上传' }].map(({ value, label }) => (
            <button key={value} type="button" onClick={() => setInputMode(value)}
              className={`px-4 py-1.5 rounded-md transition-colors ${inputMode === value ? 'bg-[#5D56C1] text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── 批量上传面板 ── */}
        {inputMode === 'batch' && (
          <div className="rounded-2xl bg-[#292929] px-6 py-6 space-y-4">
            <div><p className="text-base font-bold text-slate-300">批量序列上传</p></div>

            {/* 上传区域 */}
            {batchFileName && !batchParseError ? (
              /* 已上传状态 */
              <div className="flex items-center gap-3 rounded-xl border border-[#3a3a3a] bg-[#1F1F1F] px-4 py-3.5">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate" title={batchFileName}>{batchFileName}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">已解析 {batchSequences.length} 条序列</p>
                </div>
                <label className="shrink-0 text-xs text-[#8b85e0] hover:text-[#a9a4f0] cursor-pointer transition-colors">
                  重新上传
                  <input ref={batchFileInputRef} type="file" accept=".fasta,.fa,.faa,.fas,.txt,.xlsx,.xls,.pdb,.ent,.zip" className="hidden" onChange={handleBatchFileUpload} />
                </label>
              </div>
            ) : (
              /* 未上传 / 解析错误状态 */
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#555555] hover:border-[#5D56C1] px-6 py-8 cursor-pointer transition-colors">
                <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm text-slate-400">点击上传 FASTA、Excel 或 PDB 文件</span>
                <span className="text-xs text-neutral-500">.fasta · .fa · .xlsx · .xls · .pdb · .zip</span>
                <input ref={batchFileInputRef} type="file" accept=".fasta,.fa,.faa,.fas,.txt,.xlsx,.xls,.pdb,.ent,.zip" className="hidden" onChange={handleBatchFileUpload} />
              </label>
            )}

            {batchParseError && (
              <p className="text-sm text-red-400">{batchParseError}</p>
            )}

            {/* 序列预览列表：超过 30 条不展示 */}
            {batchSequences.length > 0 && batchSequences.length <= 30 && (
              <div className="rounded-xl bg-[#1F1F1F] overflow-hidden">
                <div className="grid grid-cols-[2rem_1fr_4rem_minmax(0,1fr)] gap-3 px-4 py-2 border-b border-[#333] text-xs text-neutral-500">
                  <span>#</span><span>名称</span><span className="text-right">长度</span><span>序列预览</span>
                </div>
                <div className="divide-y divide-[#2a2a2a] max-h-60 overflow-y-auto">
                  {batchSequences.map((s, i) => (
                    <div key={s.id} className="grid grid-cols-[2rem_1fr_4rem_minmax(0,1fr)] gap-3 px-4 py-2 items-center text-sm">
                      <span className="text-neutral-500 text-xs">{i + 1}</span>
                      <span className="text-slate-300 truncate" title={s.name}>{s.name}</span>
                      <span className="text-right text-slate-400 text-xs">{s.sequence.length}</span>
                      <span translate="no" className="text-slate-500 text-xs font-mono truncate">{s.sequence.slice(0, 24)}…</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 扫描规则 */}
            <div className="rounded-xl border border-[#555555] px-4 py-3 !mt-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-200">扫描规则</p>
                  <p className="text-sm text-neutral-500 mt-0.5">查看和配置风险类型、基序及风险等级</p>
                </div>
                <button type="button" onClick={() => setModalOpen(true)}
                  disabled={defaultRules.length === 0}
                  className="text-sm rounded-lg bg-[#363636] hover:bg-[#404040] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-slate-200 transition-colors">
                  查看
                </button>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3 !mt-8">
              <button type="button" onClick={handleBatchScan}
                disabled={batchSequences.length === 0 || batchLoading}
                className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-slate-50 transition-colors">
                {batchLoading ? `扫描中… ${batchProgress.done}/${batchProgress.total}` : `开始批量扫描${batchSequences.length > 0 ? `（${batchSequences.length} 条）` : ''}`}
              </button>
              {batchSequences.length > 0 && (
                <button type="button" onClick={handleBatchClear}
                  className="inline-flex items-center justify-center rounded-lg bg-[#363636] px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-[#404040] transition-colors">
                  清空
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleScan} className={`space-y-4 rounded-2xl bg-[#292929] px-6 py-6 ${inputMode === 'batch' ? 'hidden' : ''}`}>
          <div><label className="text-base font-bold text-slate-300">氨基酸序列</label></div>
          <textarea
            className="w-full h-36 rounded-xl bg-[#1F1F1F] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5D56C1] resize-none font-mono !mt-2"
            placeholder="请输入序列，或上传蛋白文件自动提取"
            value={sequence} onChange={(e) => setSequence(e.target.value)} />

          <div className="flex flex-wrap items-center gap-3 text-sm !mt-2">
            <label className="inline-flex items-center gap-2 rounded-lg bg-[#363636] px-3 py-2 cursor-pointer hover:bg-[#404040] active:bg-[#333] transition-colors">
              <span className="text-sm text-slate-100">上传蛋白文件</span>
              <input ref={fileInputRef} type="file" accept=".pdb,.ent,.cif,.mmcif" className="hidden" onChange={handlePdbUpload} />
            </label>
            {pdbFileName && <span className="text-slate-400 truncate max-w-[180px]" title={pdbFileName}>{pdbFileName}</span>}
          </div>

          <div className="rounded-xl border border-[#555555] px-4 py-3 !mt-8">
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

          {/* 扫描规则 — 查看按钮（始终显示，规则加载完成前禁用） */}
          <div className="rounded-xl border border-[#555555] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-200">扫描规则</p>
                <p className="text-sm text-neutral-500 mt-0.5">查看和配置风险类型、基序及风险等级</p>
              </div>
              <button type="button" onClick={() => setModalOpen(true)}
                disabled={defaultRules.length === 0}
                className="text-sm rounded-lg bg-[#363636] hover:bg-[#404040] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 text-slate-200 transition-colors">
                查看
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 !mt-8">
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
      <RulesModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultRules={defaultRules}
        customRules={customRules}
        setCustomRules={setCustomRules}
        userRules={userRules}
        setUserRules={setUserRules}
      />
    </div>
  );
}
