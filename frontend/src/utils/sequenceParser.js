/**
 * 多序列解析工具
 * 支持 FASTA 和 Excel（.xlsx/.xls）格式
 * 统一输出：[{ id, name, sequence }]
 */

const AA_RE = /^[ACDEFGHIKLMNPQRSTVWYBXZJU*\-]+$/i;

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
    id: `fasta-${i}-${Date.now()}`,
    name: s.name,
    sequence: s.sequence,
  }));
}

/** 解析 Excel 文件（ArrayBuffer），返回序列数组（async，懒加载 xlsx） */
export async function parseExcel(buffer) {
  const XLSX = (await import('xlsx')).default;
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
        id: `excel-${i}-${Date.now()}`,
        name: String(name).trim() || `Seq${sequences.length + 1}`,
        sequence: cleaned,
      });
    }
  }

  return sequences;
}

/** 根据文件名判断格式并解析，返回 { sequences, format, error } */
export async function parseSequenceFile(file) {
  const name = file.name.toLowerCase();
  const isFasta = /\.(fasta|fa|faa|fas|txt)$/.test(name);
  const isExcel = /\.(xlsx|xls)$/.test(name);

  if (!isFasta && !isExcel) {
    return { sequences: [], format: null, error: '不支持的文件格式，请上传 .fasta、.fa 或 .xlsx/.xls 文件' };
  }

  try {
    if (isFasta) {
      const text = await file.text();
      const sequences = parseFasta(text);
      if (sequences.length === 0) {
        return { sequences: [], format: 'fasta', error: '未能从文件中识别出任何序列，请确认 FASTA 格式是否正确' };
      }
      return { sequences, format: 'fasta', error: null };
    }

    if (isExcel) {
      const buffer = await file.arrayBuffer();
      const sequences = await parseExcel(buffer);
      if (sequences.length === 0) {
        return { sequences: [], format: 'excel', error: '未能从 Excel 中识别出任何序列，请确认列格式（名称列 + 序列列）' };
      }
      return { sequences, format: 'excel', error: null };
    }
  } catch (e) {
    return { sequences: [], format: null, error: `解析失败：${e.message}` };
  }
}
