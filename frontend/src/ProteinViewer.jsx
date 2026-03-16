import { useEffect, useRef, useCallback, useMemo } from 'react';

/* ── Kabat 近似 CDR 区间（1-based 残基编号） ── */
const CDR_REGIONS = [
  { name: 'CDR1', start: 26, end: 35,  color: { r: 230, g: 50,  b: 50  } },
  { name: 'CDR2', start: 50, end: 65,  color: { r: 50,  g: 190, b: 50  } },
  { name: 'CDR3', start: 95, end: 102, color: { r: 60,  g: 100, b: 240 } },
];

// 构建 CDR 残基编号集合（用于快速判断）
const CDR_RESIDUE_SET = new Set();
CDR_REGIONS.forEach(r => {
  for (let i = r.start; i <= r.end; i++) CDR_RESIDUE_SET.add(i);
});

/* ── PDB：解析 CA 原子坐标 ── */
function parseCaCoordsFromPdb(text) {
  const atoms = [], seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('ATOM')) continue;
    if (line.substring(12, 16).trim() !== 'CA') continue;
    const resNum = parseInt(line.substring(22, 26).trim(), 10);
    if (isNaN(resNum) || seen.has(resNum)) continue;
    seen.add(resNum);
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    if (!isNaN(x)) atoms.push({ resNum, x, y, z });
  }
  return atoms;
}

/* ── mmCIF：解析 CA 原子坐标 ── */
function parseCaCoordsFromCif(text) {
  const lines = text.split(/\r?\n/);
  let inAtomSite = false;
  const colNames = [], dataRows = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === 'loop_') { inAtomSite = false; colNames.length = 0; continue; }
    if (t.startsWith('_atom_site.')) { inAtomSite = true; colNames.push(t); continue; }
    if (inAtomSite && !t.startsWith('_') && t.length > 0 && t !== '#') {
      if (t.startsWith('loop_') || t.startsWith('data_')) { inAtomSite = false; continue; }
      dataRows.push(t);
    } else if (inAtomSite && t.startsWith('_') && !t.startsWith('_atom_site.')) {
      inAtomSite = false;
    }
  }
  const ci = (n) => colNames.indexOf(n);
  const iGroup = ci('_atom_site.group_PDB');
  const iAtom  = ci('_atom_site.label_atom_id');
  const iSeq   = ci('_atom_site.auth_seq_id') >= 0 ? ci('_atom_site.auth_seq_id') : ci('_atom_site.label_seq_id');
  const iX = ci('_atom_site.Cartn_x'), iY = ci('_atom_site.Cartn_y'), iZ = ci('_atom_site.Cartn_z');
  if (iAtom < 0 || iSeq < 0 || iX < 0) return [];
  const atoms = [], seen = new Set();
  for (const row of dataRows) {
    const p = row.split(/\s+/);
    if (iGroup >= 0 && p[iGroup] !== 'ATOM') continue;
    if (p[iAtom] !== 'CA') continue;
    const resNum = parseInt(p[iSeq], 10);
    if (isNaN(resNum) || seen.has(resNum)) continue;
    seen.add(resNum);
    const x = parseFloat(p[iX]), y = parseFloat(p[iY]), z = parseFloat(p[iZ]);
    if (!isNaN(x)) atoms.push({ resNum, x, y, z });
  }
  return atoms;
}

/* ── 找出距目标 CA ≤ radius Å 的邻近残基 ── */
function findResiduesWithin(caAtoms, targetResNum, radius) {
  const target = caAtoms.find(a => a.resNum === targetResNum);
  if (!target) return [];
  const r2 = radius * radius;
  return caAtoms
    .filter(a => {
      if (a.resNum === targetResNum) return false;
      const dx = a.x - target.x, dy = a.y - target.y, dz = a.z - target.z;
      return dx * dx + dy * dy + dz * dz <= r2;
    })
    .map(a => a.resNum);
}

/* ══════════════════════════════════════════════ */

function ProteinViewer({ pdbUrl, pdbFormat = 'pdb', pdbText, selectedResidue, proteinType }) {
  const isAntibody = proteinType === 'Antibody';
  const viewerRef   = useRef(null);
  const pluginRef   = useRef(null);
  const currentUrl  = useRef(null);
  const loadTimer   = useRef(null);

  const caAtoms = useMemo(() => {
    if (!pdbText) return [];
    return pdbFormat === 'mmcif' ? parseCaCoordsFromCif(pdbText) : parseCaCoordsFromPdb(pdbText);
  }, [pdbText, pdbFormat]);

  /* ── 销毁 ── */
  const destroyPlugin = useCallback(() => {
    if (loadTimer.current)   { clearInterval(loadTimer.current.iv); clearTimeout(loadTimer.current.to); loadTimer.current = null; }
    if (pluginRef.current)   { try { pluginRef.current.clear(); } catch {} pluginRef.current = null; }
    currentUrl.current = null;
  }, []);

  /* ── 通过 Mol* API 添加半透明 Surface 层 ── */
  const addSurfaceLayer = useCallback(async () => {
    const inst = pluginRef.current;
    if (!inst?.plugin) return;
    const ctx = inst.plugin;
    try {
      const structs = ctx.managers.structure.hierarchy.current.structures;
      if (!structs.length) return;
      const components = structs[0].components;
      for (const comp of components) {
        await ctx.managers.structure.component.addRepresentation(comp, 'molecular-surface');
      }
      // 等新表示注册后，更新透明度
      await new Promise(r => setTimeout(r, 400));
      const structs2 = ctx.managers.structure.hierarchy.current.structures;
      if (!structs2.length) return;
      for (const comp of structs2[0].components) {
        for (const repr of comp.representations) {
          const typeName = repr.cell?.params?.values?.type?.name;
          if (typeName === 'molecular-surface') {
            const ref = repr.cell.transform.ref;
            await ctx.state.data.build().to(ref).update(old => ({
              ...old,
              type: { ...old.type, params: { ...(old.type?.params || {}), alpha: 0.3 } },
            })).commit();
          }
        }
      }
    } catch {
      // Surface 不可用时静默降级
    }
  }, []);

  /* ── CDR 着色 + Framework 灰色 ── */
  const applyCdrColoring = useCallback(() => {
    if (!pluginRef.current) return;
    const colorData = [];
    for (const region of CDR_REGIONS) {
      for (let i = region.start; i <= region.end; i++) {
        colorData.push({ residue_number: i, color: region.color });
      }
    }
    try {
      pluginRef.current.visual.setColor({
        data: colorData,
        nonSelectedColor: { r: 200, g: 200, b: 200 }, // Framework = 浅灰
      });
    } catch {}
  }, []);

  /* ── 初始化 Molstar ── */
  useEffect(() => {
    if (!viewerRef.current || !pdbUrl) { destroyPlugin(); return; }
    if (currentUrl.current === pdbUrl) return;

    // 等待 Mol* 脚本异步加载完成（最长等 30 秒）
    let cancelled = false;
    function init() {
      if (cancelled) return;
      const PDBeMolstarPlugin = window.PDBeMolstarPlugin;
      if (!PDBeMolstarPlugin) {
        setTimeout(init, 500);
        return;
      }
      doInit(PDBeMolstarPlugin);
    }
    const waitTimeout = setTimeout(() => { cancelled = true; }, 30000);
    init();
    return () => { cancelled = true; clearTimeout(waitTimeout); destroyPlugin(); };
  }, [pdbUrl, pdbFormat, destroyPlugin, addSurfaceLayer, applyCdrColoring]);

  const doInit = useCallback((PDBeMolstarPlugin) => {
    destroyPlugin();
    if (!viewerRef.current) return;
    viewerRef.current.innerHTML = '';

    const plugin = new PDBeMolstarPlugin();
    pluginRef.current = plugin;
    currentUrl.current = pdbUrl;

    plugin.render(viewerRef.current, {
      customData: { url: pdbUrl, format: pdbFormat },
      expanded: false,
      landscape: true,
      hideControls: true,
      hideCanvasControls: ['expand', 'animation', 'selection'],
      bgColor: { r: 31, g: 31, b: 31 },
      highlightColor: { r: 255, g: 255, b: 0 },
    });

    // 等结构加载完 → 加 Surface → CDR 着色
    const iv = setInterval(() => {
      try {
        const s = plugin.plugin?.managers?.structure?.hierarchy?.current?.structures;
        if (s && s.length > 0) {
          clearInterval(iv); clearTimeout(to);
          loadTimer.current = null;
          (async () => {
            await addSurfaceLayer();
            await new Promise(r => setTimeout(r, 200));
            applyCdrColoring();
          })();
        }
      } catch {}
    }, 400);
    const to = setTimeout(() => { clearInterval(iv); loadTimer.current = null; }, 15000);
    loadTimer.current = { iv, to };
  }, [pdbUrl, pdbFormat, destroyPlugin, addSurfaceLayer, applyCdrColoring]);

  /* ── 残基选中：Ball & Stick (黄色) + 5Å 环境 + Focus ── */
  useEffect(() => {
    if (!pluginRef.current || !selectedResidue || !pdbUrl) return;

    try {
      pluginRef.current.visual.clearSelection();
      pluginRef.current.visual.clearHighlight();

      // 5Å 邻居
      const nearby = findResiduesWithin(caAtoms, selectedResidue, 5.0);

      // 选中：目标 = 黄色 Ball & Stick，邻居 = 半透明灰
      pluginRef.current.visual.select({
        data: [
          {
            residue_number: selectedResidue,
            sideChain: true,
            color: { r: 255, g: 255, b: 0 },
            focus: true,
          },
          ...nearby.map(n => ({
            residue_number: n,
            sideChain: true,
            color: { r: 180, g: 180, b: 195 },
          })),
        ],
      });

      // Focus 相机
      pluginRef.current.visual.focus({
        data: [{ residue_number: selectedResidue }],
      });

      // 高亮选中残基
      pluginRef.current.visual.highlight({
        data: [{ residue_number: selectedResidue }],
      });

      // 补回 CDR 着色
      setTimeout(applyCdrColoring, 300);
    } catch {
      try { pluginRef.current.visual.focus({ data: [{ residue_number: selectedResidue }] }); } catch {}
    }
  }, [selectedResidue, pdbUrl, caAtoms, applyCdrColoring]);

  return (
    <div className="h-[360px] md:h-full rounded-2xl bg-[#1F1F1F] overflow-hidden relative">
      <div
        ref={viewerRef}
        className="w-full h-full"
        style={{ display: pdbUrl ? 'block' : 'none' }}
      />
      {!pdbUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          上传 PDB 文件后，这里将展示 3D 结构
        </div>
      )}
      {pdbUrl && isAntibody && (
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] pointer-events-none">
          <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(230,50,50,0.25)', color: '#e63232' }}>CDR1</span>
          <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(50,190,50,0.25)', color: '#32be32' }}>CDR2</span>
          <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(60,100,240,0.25)', color: '#3c64f0' }}>CDR3</span>
          <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(200,200,200,0.15)', color: '#c8c8c8' }}>FR</span>
        </div>
      )}
    </div>
  );
}

export default ProteinViewer;
