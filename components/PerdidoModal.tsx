"use client";

import { useEffect, useState } from "react";
import type { EnumOption } from "@/lib/types";

type Props = {
  cardTitle: string;
  motivoOptions: EnumOption[];
  onCancel: () => void;
  onConfirm: (fields: {
    motivoId: string;
    descricao: string;
  }) => Promise<void>;
};

// Modal disparado quando o usuário move um negócio para a etapa "Negócio
// perdido" (APOLOGY). Espelha o que o próprio Bitrix exige na transição:
//   1) Motivo de perda — enum SINGLE (≠ Congelado que era multi)
//   2) Descrição do motivo de perda — string
// Não tem "Serviços mapeados" (esse é só de Congelado).
export default function PerdidoModal({
  cardTitle,
  motivoOptions,
  onCancel,
  onConfirm,
}: Props) {
  const [motivoId, setMotivoId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  async function handleConfirm() {
    if (!motivoId) {
      setError("Selecione o motivo da perda");
      return;
    }
    if (!descricao.trim()) {
      setError("Preencha a descrição do motivo de perda");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({ motivoId, descricao: descricao.trim() });
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
              Marcar como Perdido
            </h2>
            <div className="text-[11px] text-slate-500 mt-0.5 break-words">
              {cardTitle}
            </div>
          </div>
          <button type="button"
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
          <div className="text-[12px] text-slate-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
            Para marcar esse negócio como perdido, preencha os dois campos
            abaixo. Ambos são obrigatórios.
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1.5">
              Motivo de perda <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {motivoOptions.map((opt) => {
                const selected = motivoId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMotivoId(opt.id)}
                    disabled={saving}
                    className={`text-[12px] px-2.5 py-1 rounded-full border transition ${
                      selected
                        ? "bg-rose-500 border-rose-500 text-white"
                        : "bg-white border-slate-200 text-slate-700 hover:border-rose-300"
                    } disabled:opacity-50`}
                  >
                    {opt.value}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
              Descrição do motivo de perda{" "}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={saving}
              rows={4}
              placeholder="Explique com mais detalhes por que perdemos esse negócio…"
              className="w-full text-base sm:text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 resize-y disabled:bg-slate-50"
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              {error}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 shrink-0 safe-bottom">
          <button type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm bg-rose-500 hover:bg-rose-600 text-white rounded-md transition disabled:opacity-50 font-medium"
          >
            {saving ? "Salvando…" : "Marcar como Perdido"}
          </button>
        </div>
      </div>
    </div>
  );
}
