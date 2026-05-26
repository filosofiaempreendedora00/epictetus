"use client";

import { useEffect, useState } from "react";
import type { EnumOption } from "@/lib/types";

type Props = {
  cardTitle: string;
  motivoOptions: EnumOption[];
  servicosOptions: EnumOption[];
  onCancel: () => void;
  onConfirm: (fields: {
    motivoIds: string[];
    descricao: string;
    servicoIds: string[];
  }) => Promise<void>;
};

export default function CongeladoModal({
  cardTitle,
  motivoOptions,
  servicosOptions,
  onCancel,
  onConfirm,
}: Props) {
  const [motivoIds, setMotivoIds] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");
  const [servicoIds, setServicoIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  function toggle(arr: string[], setter: (v: string[]) => void, id: string) {
    setter(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }

  async function handleConfirm() {
    if (motivoIds.length === 0) {
      setError("Selecione pelo menos um motivo de perda");
      return;
    }
    if (!descricao.trim()) {
      setError("Preencha a descrição do motivo de perda");
      return;
    }
    if (servicoIds.length === 0) {
      setError("Selecione pelo menos um serviço mapeado");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({ motivoIds, descricao: descricao.trim(), servicoIds });
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
              Mover para Congelado
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
            Para congelar esse negócio, preencha os campos abaixo. Todos são
            obrigatórios.
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1.5">
              Motivo de perda <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {motivoOptions.map((opt) => {
                const selected = motivoIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(motivoIds, setMotivoIds, opt.id)}
                    disabled={saving}
                    className={`text-[12px] px-2.5 py-1 rounded-full border transition ${
                      selected
                        ? "bg-sky-500 border-sky-500 text-white"
                        : "bg-white border-slate-200 text-slate-700 hover:border-sky-300"
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
              placeholder="Conte com mais detalhes por que esse negócio foi congelado…"
              className="w-full text-base sm:text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 resize-y disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1.5">
              Serviços mapeados <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {servicosOptions.map((opt) => {
                const selected = servicoIds.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(servicoIds, setServicoIds, opt.id)}
                    disabled={saving}
                    className={`text-[12px] px-2.5 py-1 rounded-full border transition ${
                      selected
                        ? "bg-sky-500 border-sky-500 text-white"
                        : "bg-white border-slate-200 text-slate-700 hover:border-sky-300"
                    } disabled:opacity-50`}
                  >
                    {opt.value}
                  </button>
                );
              })}
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
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2.5 sm:py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-md transition disabled:opacity-50 font-medium"
          >
            {saving ? "Salvando…" : "Congelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
