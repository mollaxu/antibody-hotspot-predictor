/**
 * 多序列解析工具
 * 支持 FASTA、Excel（.xlsx/.xls）、PDB（.pdb/.ent）和 ZIP（含 PDB 文件）格式
 * 统一输出：[{ id, name, sequence }]
 */
import { extractAllChainsFromPdb } from './pdb.js';

const AA_RE = /^[ACDEFGHIKLMNPQRSTVWYBXZJU*\-]+$/i;

// 模块级自增计数器，保证每条序列 ID 全局唯一（避免同毫秒并发解析导致 Date.now() 碰撞）
let _seqIdCounter = 0;
const nextSeqId = () => ++_seqIdCounter;

// 标准 PDB ID：1 个数字 + 3 个字母/数字（如 5xh3、1abc）
const PDB_ID_RE = /^[0-9][a-zA-Z0-9]{3}$/;

function extractPdbId(fileName) {
  const stem = (fileName || '').replace(/\.[^.]+$/, '');
  return PDB_ID_RE.test(stem) ? stem.toLowerCase() : null;
}

function cleanSeq(raw) {
  return String(raw || '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

function looksLikeSeq(str) {
  const s = String(str || '').trim().replace(/\s/g, '');
  return s.length >= 5 && AA_RE.test(s);
}

/** 解析 FASTA 文本，返回序列数组 */
export function parseFasta(text) {
  const sequences = [];
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('>')) {
      if (current && current.sequence) sequences.push(current);
      const header = line.slice(1).trim();
      const spaceIdx = header.search(/\s/);
      const name = spaceIdx === -1 ? header : header.slice(0, spaceIdx);
      current = {
        name: name || `Seq${sequences.length + 1}`,
        sequence: '',
      };
    } else if (current) {
      current.sequence += cleanSeq(line);
    }
  }

  if (current && current.sequence) sequences.push(current);

  return sequences.map((s, i) => ({
    id: `fasta-${i}-${nextSeqId()}`,
    name: s.name,
    sequence: s.sequence,
  }));
}

/** 解析 Excel 文件（ArrayBuffer），返回序列数组（async，懒加载 xlsx） */
export async function parseExcel(buffer) {
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default ?? xlsxModule;
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 识别 header 关键词
  const NAME_KEYS = ['name', 'id', '名称', '序列名', 'antibody', 'label'];
  const SEQ_KEYS  = ['sequence', 'seq', '序列', '氨基酸', 'aa'];

  let nameCol = -1;
  let seqCol  = -1;
  let dataStart = 0;

  if (rows.length > 0) {
    const header = rows[0].map(c => String(c).toLowerCase().trim());
    nameCol = header.findIndex(h => NAME_KEYS.some(k => h.includes(k)));
    seqCol  = header.findIndex(h => SEQ_KEYS.some(k => h.includes(k)));
    if (seqCol !== -1) dataStart = 1; // 有 header 行，从第 2 行开始
  }

  const sequences = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i].map(c => String(c || '').trim());
    if (row.every(c => !c)) continue; // 空行

    let name = null;
    let seqStr = null;

    if (seqCol !== -1) {
      // header 识别成功
      seqStr = row[seqCol] || '';
      name   = nameCol !== -1 ? (row[nameCol] || `Seq${sequences.length + 1}`) : `Seq${sequences.length + 1}`;
    } else if (row.length >= 2 && looksLikeSeq(row[1])) {
      // 两列：第一列名称，第二列序列
      name   = row[0] || `Seq${sequences.length + 1}`;
      seqStr = row[1];
    } else if (row.length >= 1 && looksLikeSeq(row[0])) {
      // 单列：仅序列
      name   = `Seq${sequences.length + 1}`;
      seqStr = row[0];
    } else {
      continue; // 无法识别，跳过
    }

    const cleaned = cleanSeq(seqStr);
    if (cleaned.length >= 5) {
      sequences.push({
        id: `excel-${i}-${nextSeqId()}`,
        name: String(name).trim() || `Seq${sequences.length + 1}`,
        sequence: cleaned,
      });
    }
  }

  return sequences;
}

/**
 * 解析单个 PDB 文本，按链拆分为多条序列。
 * 单链时名称为文件名（去后缀），多链时追加 _ChainX。
 */
export function parsePdbText(pdbText, fileName) {
  const baseName = (fileName || 'Seq').replace(/\.[^.]+$/, '');
  const { sequence, chains } = extractAllChainsFromPdb(pdbText);
  if (!sequence) return [];

  if (chains.length <= 1) {
    return [{ id: `pdb-0-${nextSeqId()}`, name: baseName, sequence, pdbText }];
  }

  return chains.map((chain, i) => ({
    id: `pdb-${i}-${nextSeqId()}`,
    name: `${baseName}_Chain${chain.id}`,
    sequence: sequence.slice(chain.start, chain.end),
    pdbText,
  }));
}

/** 解压 ZIP（ArrayBuffer），提取其中所有 .pdb/.ent 和 FASTA 文件并解析序列。
 *
 * 每个文件独立输出条目，不会因匹配而被抑制。
 * 若 FASTA 与同名 PDB 共存，FASTA 条目会携带该 PDB 的结构数据；
 * 对应 PDB 文件仍会独立输出自己的条目。
 */
export async function parseZip(buffer) {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer));

  // 跳过 macOS 自动生成的元数据文件（__MACOSX/ 目录或 ._ 前缀）
  const isMacMeta = (filePath) =>
    filePath.startsWith('__MACOSX/') || filePath.split('/').pop().startsWith('._');

  // 第一遍：按文件名主干（小写）收集所有 PDB 文件内容
  const pdbByStem = {};
  for (const [filePath, data] of Object.entries(files)) {
    if (isMacMeta(filePath)) continue;
    const fileName = filePath.split('/').pop();
    if (!fileName || !/\.(pdb|ent)$/i.test(fileName)) continue;
    const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase();
    pdbByStem[stem] = new TextDecoder().decode(data);
  }

  // 第二遍：每个文件独立生成序列条目
  const sequences = [];
  for (const [filePath, data] of Object.entries(files)) {
    if (isMacMeta(filePath)) continue;
    const fileName = filePath.split('/').pop();
    if (!fileName) continue;
    const text = new TextDecoder().decode(data);

    if (/\.(pdb|ent)$/i.test(fileName)) {
      sequences.push(...parsePdbText(text, fileName));
    } else if (/\.(fasta|fa|faa|fas|txt)$/i.test(fileName)) {
      const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase();
      const matchingPdb = pdbByStem[stem];
      const fastaSeqs = parseFasta(text);
      if (matchingPdb) {
        // 同名 PDB 存在：结构附到 FASTA 条目，PDB 文件仍会独立输出
        sequences.push(...fastaSeqs.map(s => ({ ...s, pdbText: matchingPdb })));
      } else {
        // 无同名 PDB：主干若是 PDB ID，标记供详情页从 RCSB 拉取结构
        const pdbId = PDB_ID_RE.test(stem) ? stem : null;
        sequences.push(...fastaSeqs.map(s => pdbId ? { ...s, pdbId } : s));
      }
    }
  }

  return sequences;
}

/** 根据文件名判断格式并解析，返回 { sequences, format, error } */
export async function parseSequenceFile(file) {
  const name = file.name.toLowerCase();
  const isFasta = /\.(fasta|fa|faa|fas|txt)$/.test(name);
  const isExcel = /\.(xlsx|xls)$/.test(name);
  const isPdb   = /\.(pdb|ent)$/.test(name);
  const isZip   = /\.zip$/.test(name);

  if (!isFasta && !isExcel && !isPdb && !isZip) {
    return { sequences: [], format: null, error: '不支持的文件格式，请上传 .fasta、.fa、.xlsx/.xls、.pdb 或 .zip 文件' };
  }

  try {
    if (isFasta) {
      const text = await file.text();
      const sequences = parseFasta(text);
      if (sequences.length === 0) {
        return { sequences: [], format: 'fasta', error: '未能从文件中识别出任何序列，请确认 FASTA 格式是否正确' };
      }
      const pdbId = extractPdbId(file.name);
      return {
        sequences: pdbId ? sequences.map(s => ({ ...s, pdbId })) : sequences,
        format: 'fasta',
        error: null,
      };
    }

    if (isExcel) {
      const buffer = await file.arrayBuffer();
      const sequences = await parseExcel(buffer);
      if (sequences.length === 0) {
        return { sequences: [], format: 'excel', error: '未能从 Excel 中识别出任何序列，请确认列格式（名称列 + 序列列）' };
      }
      return { sequences, format: 'excel', error: null };
    }

    if (isPdb) {
      const text = await file.text();
      const sequences = parsePdbText(text, file.name);
      if (sequences.length === 0) {
        return { sequences: [], format: 'pdb', error: '未能从 PDB 文件中识别出任何序列，请确认文件包含 SEQRES 或 ATOM 记录' };
      }
      return { sequences, format: 'pdb', error: null };
    }

    if (isZip) {
      const buffer = await file.arrayBuffer();
      const sequences = await parseZip(buffer);
      if (sequences.length === 0) {
        return { sequences: [], format: 'zip', error: 'ZIP 包中未找到可解析的 PDB 文件（.pdb / .ent）' };
      }
      return { sequences, format: 'zip', error: null };
    }
  } catch (e) {
    return { sequences: [], format: null, error: `解析失败：${e.message}` };
  }
}
