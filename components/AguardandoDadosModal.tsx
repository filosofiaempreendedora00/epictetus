"use client";

import { useEffect, useState } from "react";

type Props = {
  cardTitle: string;
  onCancel: () => void;
  onConfirm: (fields: {
    briefingProjeto: string;
    linkContrato: string;
  }) => Promise<void>;
};

// Modal disparado quando o usuário move (drag ou via dropdown) um negócio
// pra etapa "Aguardado os dados" (UC_YN6AV9). Mantém paridade visual e de
// comportamento com CongeladoModal:
//   - backdrop com blur, fechável só por X (não clica-fora durante save)
//   - mobile full-screen, desktop centralizado
//   - botão Salvar disabled enquanto algum campo obrigatório está vazio
export default function AguardandoDadosModal({
  cardTitle,
  onCancel,
  onConfirm,
}: Props) {
  const [briefing, setBriefing] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc fecha (mas só se não está salvando — não quero abortar mid-flight)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const canSubmit = briefing.trim().length > 0 && link.trim().length > 0;

  async function handleConfirm() {
    if (!canSubmit) {
      setError("Preencha o briefing e o link do contrato.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({
        briefingProjeto: briefing.trim(),
        linkContrato: link.trim(),
      });
    } catch (e: any) {
      setError(e?.message || "Erro ao salvar");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div
        className="bg-white shadow-2xl w-full sm:max-w-lg flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top px-4 sm:px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Mover para Aguardando Dados
            </h2>
            <div className="text-[11px] text-slate-500 mt-0.5 break-words">
              {cardTitle}
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="text-slate-400 hover:text-slate-700 transition text-lg leading-none w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 -mr-2 sm:mr-0"
            title="Cancelar"
            aria-label="Cancelar"
          >
            ✕
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div className="text-[12px] text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Preencha os dois campos abaixo para avançar pra etapa{" "}
            <strong>Aguardando Dados</strong>. Ambos são obrigatórios.
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Briefing do projeto <span className="text-red-500">*</span>
            </label>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              disabled={saving}
              rows={6}
              placeholder="Resuma o briefing combinado com o cliente, escopo, prazos, etc."
              className="w-full text-base sm:text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 resize-y disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Link do Contrato <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={saving}
              placeholder="https://..."
              className="w-full text-base sm:text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2.5 sm:py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:bg-slate-50"
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0 safe-bottom">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !canSubmit}
            className="px-4 py-2.5 sm:py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition disabled:opacity-50 font-medium"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
