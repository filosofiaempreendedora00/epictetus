"use client";

import { useEffect, useState } from "react";

type StageOption = {
  stageId: string;
  title: string;
  // Mesma string de gradient tailwind usada na Column (ex: "from-[#abc] to-[#def]"),
  // pra cada botão do modal usar a cor da própria coluna.
  color?: string;
};

type Props = {
  cardTitle: string;
  currentStageId?: string;
  stages: StageOption[];
  onClose: () => void;
  onSave: (newStageId: string) => Promise<void>;
};

// Antes esse modal era um <select> + botão "Salvar" — abrir, escolher
// na lista, clicar Salvar, esperar. Roberto reclamou que o fluxo de
// "clicar no card pra congelar" tava lento. Agora cada etapa é um
// botão grande com a cor da coluna; um clique já dispara onSave (que
// no Board.tsx roteia direto pro modal apropriado quando a etapa exige
// campos obrigatórios — Congelado, Perdido, Aguardando…).
export default function DealEditModal({
  cardTitle,
  currentStageId,
  stages,
  onClose,
  onSave,
}: Props) {
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = savingStageId !== null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function handlePick(stageId: string) {
    // Bater no mesmo estágio = fechar sem ação
    if (stageId === currentStageId) {
      onClose();
      return;
    }
    setSavingStageId(stageId);
    setError(null);
    try {
      await onSave(stageId);
      // onSave aciona o handleChangeStage do Board, que:
      //  - se a etapa exige modal (Congelado, Perdido, Aguardando…),
      //    seta o pending* state correspondente e retorna rápido →
      //    aqui dá onClose() e o pending* abre o próximo modal.
      //  - se for transição direta, faz PATCH no Bitrix antes de
      //    resolver → aqui já tá com o spinner naquele botão.
      onClose();
    } catch (e: any) {
      setError(e?.message || "Erro ao mudar a fase");
      setSavingStageId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="bg-white shadow-2xl w-full sm:max-w-md flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-xl overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top px-5 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between shrink-0 gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              Mover para
            </h2>
            <div className="text-[12px] text-slate-500 mt-0.5 break-words">
              {cardTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 transition text-lg leading-none w-10 h-10 flex items-center justify-center shrink-0 -mr-2"
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 overflow-y-auto flex-1">
          <div className="flex flex-col gap-2">
            {stages.map((s) => {
              const isCurrent = s.stageId === currentStageId;
              const isSavingThis = savingStageId === s.stageId;
              const otherSaving = busy && !isSavingThis;
              const colorClass =
                s.color || "from-slate-400 to-slate-500";
              return (
                <button
                  key={s.stageId}
                  type="button"
                  onClick={() => handlePick(s.stageId)}
                  disabled={busy || isCurrent}
                  className={`group relative w-full text-left rounded-xl px-4 py-3 shadow-sm transition flex items-center justify-between gap-3 ${
                    isCurrent
                      ? "bg-slate-100 border-2 border-slate-300 cursor-default"
                      : `bg-gradient-to-r ${colorClass} text-white hover:brightness-110 hover:shadow-md active:brightness-95 disabled:opacity-50`
                  } ${otherSaving ? "opacity-40" : ""}`}
                  aria-label={`Mover para ${s.title}`}
                >
                  <span
                    className={`font-medium text-[14px] ${
                      isCurrent ? "text-slate-700" : "text-white"
                    }`}
                  >
                    {s.title}
                  </span>
                  {isCurrent ? (
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium shrink-0">
                      Etapa atual
                    </span>
                  ) : isSavingThis ? (
                    <span className="text-[12px] text-white/90 shrink-0 inline-flex items-center gap-1.5">
                      <svg
                        className="animate-spin w-3.5 h-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeOpacity="0.3"
                        />
                        <path
                          d="M22 12a10 10 0 0 1-10 10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      Movendo…
                    </span>
                  ) : (
                    <span className="text-white/70 text-base shrink-0 group-hover:translate-x-0.5 transition">
                      →
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0 safe-bottom">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-200 rounded-md transition disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
