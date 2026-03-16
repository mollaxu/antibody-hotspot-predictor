import { useRef, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { detectFormat, extractAllChains } from '../utils/pdb.js';

export default function InputPage() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [enablePrediction, setEnablePrediction] = useState(true);

  const {
    sequence, setSequence,
    loading, error, setError,
    pdbUrl, pdbFileName, setPdbFileName, setPdbFormat, setPdbUrl, setPdbText,
    setChainInfo,
    runScan, predictStructure, cleanSequence,
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
        setSequence(seqFromPdb);
        setChainInfo(chains);
        setPdbText(text);
        setPdbFileName(file.name);
        setPdbFormat(fmt);
        setPdbUrl(url);
      } else {
        URL.revokeObjectURL(url);
        setError('无法解析该蛋白文件序列，请手动输入');
      }
    };

    reader.readAsText(file);
  };

  const handleScan = async (e) => {
    if (e) e.preventDefault();
    const seq = cleanSequence(sequence || '');
    if (!seq) {
      setError('请输入氨基酸序列。');
      return;
    }
    const scanPromise = runScan(sequence);
    if (enablePrediction && !pdbUrl) {
      predictStructure(sequence);
    }
    await scanPromise;
    navigate('/results');
  };

  const handleClear = () => {
    parentClear();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex items-start justify-center">
      <div className="w-full max-w-2xl space-y-5 py-8">
        <form onSubmit={handleScan} className="space-y-4 rounded-2xl bg-[#292929] px-6 py-6">
          {/* 序列输入 */}
          <div>
            <label className="text-base font-bold text-slate-300">氨基酸序列</label>
          </div>
          <textarea
            className="w-full h-36 rounded-xl bg-[#1F1F1F] border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none font-mono"
            placeholder="请输入序列，或上传蛋白文件自动提取"
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
          />

          {/* 上传 + 文件名 */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2 rounded-lg bg-[#363636] px-3 py-2 cursor-pointer hover:bg-[#404040] active:bg-[#333] transition-colors">
              <span className="text-sm text-slate-100">上传蛋白文件</span>
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
          </div>

          {/* 设置区 */}
          <div className="rounded-xl bg-[#1F1F1F] px-4 py-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm text-slate-200">结构预测</p>
                <p className="text-xs text-slate-500 mt-0.5">使用 ESMFold 自动预测 3D 结构（序列 ≤ 400 残基）</p>
              </div>
              <div
                className={`relative w-10 h-5 rounded-full transition-colors ${enablePrediction ? 'bg-[#5D56C1]' : 'bg-slate-600'}`}
                onClick={() => setEnablePrediction(v => !v)}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enablePrediction ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>

          {/* 按钮 */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#5D56C1] hover:bg-[#6d66d4] active:bg-[#4a44a8] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-slate-50 transition-colors"
            >
              {loading ? '扫描中…' : '开始扫描'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              清空
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 whitespace-pre-line">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
