"use client";

import { useEffect, useState } from "react";

type StageOption = { stageId: string; title: string };

type Props = {
  cardTitle: string;
  currentStageId?: string;
  stages: StageOption[];
  onClose: () => void;
  onSave: (newStageId: string) => Promise<void>;
};

export default function DealEditModal({
  cardTitle,
  currentStageId,
  stages,
  onClose,
  onSave,
}: Props) {
  const [stageId, setStageId] = useState(
    currentStageId || stages[0]?.stageId || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function handleSave() {
    if (!stageId || stageId === currentStageId) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(stageId);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      // Mobile: tela cheia (items-stretch, sem padding externo).
      // Desktop ≥sm: modal centralizado com backdrop blur, padding.
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        // Mobile: 100dvh, sem cantos, flex-col pra fixar header/footer.
        // Desktop: max-w-md com cantos arredondados, altura conforme conteúdo.
        className="bg-white shadow-2xl w-full sm:max-w-md flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-xl overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-slate-900">
            Editar negócio
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            // Touch area ≥40px em mobile
            className="text-slate-400 hover:text-slate-700 transition text-lg leading-none w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center -mr-2 sm:mr-0"
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Negócio
            </label>
            <div className="text-sm text-slate-900 break-words bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              {cardTitle}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Fase do funil
            </label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              disabled={saving}
              // text-base em mobile pra evitar zoom do iOS
              className="w-full text-base sm:text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2.5 sm:py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50 bg-white"
            >
              {stages.map((s) => (
                <option key={s.stageId} value={s.stageId}>
                  {s.title}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-slate-400 mt-1">
              Alterar move o card para a coluna correspondente.
            </div>
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0 safe-bottom">
          <button
            onClick={onClose}
            disabled={saving}
            // Touch target ≥44px em mobile
            className="px-4 py-2.5 sm:py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition disabled:opacity-50 font-medium"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
