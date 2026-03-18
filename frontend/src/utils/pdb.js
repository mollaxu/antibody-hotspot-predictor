/* ── 三字母 → 单字母映射 ── */
export const THREE_TO_ONE = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V'
};

/**
 * 根据文件名后缀判断结构格式（给 Molstar 用）
 */
export function detectFormat(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  if (ext === 'cif' || ext === 'mmcif') return 'mmcif';
  return 'pdb';
}

/** 工具：根据有序链 ID 列表和取序列函数，构建拼接结果 */
function buildChainResult(orderedIds, getSeqFn) {
  let offset = 0;
  const chains = [];
  let fullSeq = '';
  for (const id of orderedIds) {
    const seq = getSeqFn(id);
    if (!seq) continue;
    chains.push({ id, start: offset, end: offset + seq.length });
    fullSeq += seq;
    offset += seq.length;
  }
  return { sequence: fullSeq, chains };
}

/**
 * 从 PDB 文本提取所有链的序列。
 * 返回 { sequence, chains: [{id, start, end}] }
 */
export function extractAllChainsFromPdb(text) {
  if (!text) return { sequence: '', chains: [] };
  const lines = text.split(/\r?\n/);

  // SEQRES
  const seqByChain = {};
  const chainOrder = [];
  for (const line of lines) {
    if (!line.startsWith('SEQRES')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const chainId = parts[2];
    if (!seqByChain[chainId]) { seqByChain[chainId] = []; chainOrder.push(chainId); }
    for (const res of parts.slice(4)) {
      const aa = THREE_TO_ONE[res.toUpperCase()];
      if (aa) seqByChain[chainId].push(aa);
    }
  }
  if (chainOrder.length > 0) {
    return buildChainResult(chainOrder, (id) => seqByChain[id].join(''));
  }

  // ATOM CA 去重
  const atomByChain = {};
  const atomOrder = [];
  for (const line of lines) {
    if (!line.startsWith('ATOM')) continue;
    const atomName = line.substring(12, 16).trim();
    if (atomName !== 'CA') continue;
    const resName = line.substring(17, 20).trim();
    const chainId = line.substring(21, 22).trim() || '_';
    const resSeq = line.substring(22, 27).trim();
    const aa = THREE_TO_ONE[resName.toUpperCase()];
    if (!aa) continue;
    if (!atomByChain[chainId]) { atomByChain[chainId] = new Map(); atomOrder.push(chainId); }
    if (!atomByChain[chainId].has(resSeq)) {
      atomByChain[chainId].set(resSeq, aa);
    }
  }
  if (atomOrder.length > 0) {
    return buildChainResult(atomOrder, (id) => [...atomByChain[id].values()].join(''));
  }
  return { sequence: '', chains: [] };
}

/**
 * 从 mmCIF 文本提取所有链的序列。
 * 返回 { sequence, chains: [{id, start, end}] }
 */
export function extractAllChainsFromCif(text) {
  if (!text) return { sequence: '', chains: [] };
  const lines = text.split(/\r?\n/);

  let inAtomSite = false;
  const colNames = [];
  const dataRows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'loop_') { inAtomSite = false; colNames.length = 0; continue; }
    if (trimmed.startsWith('_atom_site.')) { inAtomSite = true; colNames.push(trimmed); continue; }
    if (inAtomSite && !trimmed.startsWith('_') && trimmed.length > 0 && trimmed !== '#') {
      if (trimmed.startsWith('loop_') || trimmed.startsWith('data_')) { inAtomSite = false; continue; }
      dataRows.push(trimmed);
    } else if (inAtomSite && (trimmed.startsWith('_') && !trimmed.startsWith('_atom_site.'))) {
      inAtomSite = false;
    }
  }

  if (colNames.length === 0 || dataRows.length === 0) return { sequence: '', chains: [] };

  const colIndex = (name) => colNames.indexOf(name);
  const iGroup = colIndex('_atom_site.group_PDB');
  const iAtom  = colIndex('_atom_site.label_atom_id');
  const iRes   = colIndex('_atom_site.label_comp_id');
  const iChain = colIndex('_atom_site.auth_asym_id') >= 0
    ? colIndex('_atom_site.auth_asym_id')
    : colIndex('_atom_site.label_asym_id');
  const iSeq   = colIndex('_atom_site.auth_seq_id') >= 0
    ? colIndex('_atom_site.auth_seq_id')
    : colIndex('_atom_site.label_seq_id');

  if (iAtom < 0 || iRes < 0 || iChain < 0 || iSeq < 0) return { sequence: '', chains: [] };

  const atomByChain = {};
  const chainOrder = [];
  for (const row of dataRows) {
    const parts = row.split(/\s+/);
    if (iGroup >= 0 && parts[iGroup] !== 'ATOM') continue;
    if (parts[iAtom] !== 'CA') continue;
    const resName = parts[iRes];
    const chainId = parts[iChain] || '_';
    const resSeq  = parts[iSeq];
    const aa = THREE_TO_ONE[resName.toUpperCase()];
    if (!aa) continue;
    if (!atomByChain[chainId]) { atomByChain[chainId] = new Map(); chainOrder.push(chainId); }
    if (!atomByChain[chainId].has(resSeq)) {
      atomByChain[chainId].set(resSeq, aa);
    }
  }

  if (chainOrder.length > 0) {
    return buildChainResult(chainOrder, (id) => [...atomByChain[id].values()].join(''));
  }
  return { sequence: '', chains: [] };
}

/**
 * 根据文件名自动选择解析方式，返回 { sequence, chains }
 */
export function extractAllChains(text, fileName) {
  const fmt = detectFormat(fileName);
  return fmt === 'mmcif'
    ? extractAllChainsFromCif(text)
    : extractAllChainsFromPdb(text);
}
