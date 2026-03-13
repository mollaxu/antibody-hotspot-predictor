import { useEffect, useRef } from 'react';

function ProteinViewer({ pdbUrl, selectedResidue }) {
  const viewerRef = useRef(null);
  const pluginRef = useRef(null);

  useEffect(() => {
    if (!viewerRef.current || !pdbUrl) return;

    const PDBeMolstarPlugin = window.PDBeMolstarPlugin;
    if (!PDBeMolstarPlugin) return;

    if (!pluginRef.current) {
      pluginRef.current = new PDBeMolstarPlugin();
      pluginRef.current.render(viewerRef.current, {
        customData: {
          url: pdbUrl,
          format: 'pdb'
        },
        hideControls: true,
        bgColor: { r: 31, g: 31, b: 31 },
        highlightColor: { r: 255, g: 80, b: 80 }
      });
    } else {
      pluginRef.current.visual.update({
        customData: { url: pdbUrl, format: 'pdb' }
      });
    }
  }, [pdbUrl]);

  useEffect(() => {
    if (!pluginRef.current || !selectedResidue || !pdbUrl) return;

    try {
      pluginRef.current.visual.select({
        data: [{ residue_number: selectedResidue }]
      });

      pluginRef.current.visual.focus({
        data: [{ residue_number: selectedResidue }]
      });
    } catch {
      // 选择失败时静默忽略
    }
  }, [selectedResidue, pdbUrl]);

  return (
    <div className="h-[360px] md:h-full rounded-2xl bg-[#1F1F1F] overflow-hidden">
      {pdbUrl ? (
        <div ref={viewerRef} className="w-full h-full" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
          上传 PDB 文件后，这里将展示 3D 结构。
        </div>
      )}
    </div>
  );
}

export default ProteinViewer;
