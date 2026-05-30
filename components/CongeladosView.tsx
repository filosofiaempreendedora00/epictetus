"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardState, Card as CardT } from "@/lib/types";
import { formatBRL } from "@/lib/initialData";
import Column from "./Column";
import { closeModal, openEditarNegocio, useRoute } from "@/lib/route";
import { findDealByQuery } from "@/lib/dateParams";

// =============================================================================
// CongeladosView — pipeline de negócios em LOSE, agrupados por motivo
// =============================================================================
//
// V1 (read-only):
// - Reusa o Column + Card da view de Negócios (mesmo visual).
// - Colunas = motivos de perda (do Bitrix).
// - Clicar num card abre o DealEditModal pelo path /congelados/<slug>.
// - Sem drag-and-drop (as colunas não têm stageId, o Column reusado
//   simplesmente não dispara mudanças de stage).
//
// Próximas iterações ficam abertas: D&D pra trocar de motivo, filtros
// por SDR/responsável/intervalo, marcar como "reaberto", etc.

const EMPTY: BoardState = { columns: [], cards: {} };

export default function CongeladosView() {
  const { route, setRoute } = useRoute();
  const [state, setState] = useState<BoardState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bitrix/congelados", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Erro ao carregar congelados");
        } else {
          setState(data as BoardState);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Erro de rede");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function filterCardIds(ids: string[]): string[] {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter((id) => {
      const c = state.cards[id];
      if (!c) return false;
      return (
        c.title.toLowerCase().includes(q) ||
        c.responsible?.toLowerCase().includes(q) ||
        c.source?.toLowerCase().includes(q) ||
        c.congeladoDescricao?.toLowerCase().includes(q) ||
        false
      );
    });
  }

  function columnTotal(colCardIds: string[]) {
    return colCardIds.reduce((sum, id) => {
      const c = state.cards[id];
      if (!c) return sum;
      return sum + (c.value || 0) + (c.pontual || 0) + (c.recurring || 0);
    }, 0);
  }

  // Stats agregadas pro topo (todos os deals em LOSE)
  const stats = useMemo(() => {
    let totalP = 0;
    let totalR = 0;
    const all = Object.values(state.cards);
    for (const c of all) {
      totalP += c.pontual || 0;
      totalR += c.recurring || 0;
    }
    return { count: all.length, totalP, totalR };
  }, [state.cards]);

  if (loading) {
    return (
      <div className="px-3 sm:px-6 py-10 text-white/80 text-sm">
        Carregando congelados do Bitrix…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-3 sm:mx-6 my-6 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
        <div className="font-medium mb-1">Não consegui carregar congelados</div>
        <div className="opacity-80">{error}</div>
      </div>
    );
  }

  return (
    <>
      {/* Barra de stats + busca (compacta, em cima do kanban) */}
      <div className="px-3 sm:px-6 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-4 text-[12px]">
          <div>
            <span className="text-white/40 uppercase tracking-wide text-[10px]">
              Total
            </span>{" "}
            <span className="text-white font-medium">{stats.count}</span>
          </div>
          <div>
            <span className="text-white/40 uppercase tracking-wide text-[10px]">
              Valor R
            </span>{" "}
            <span className="text-sky-400 font-medium">
              {formatBRL(stats.totalR)}
            </span>
          </div>
          <div>
            <span className="text-white/40 uppercase tracking-wide text-[10px]">
              Valor P
            </span>{" "}
            <span className="text-emerald-400 font-medium">
              {formatBRL(stats.totalP)}
            </span>
          </div>
        </div>

        <div className="relative ml-auto flex-1 sm:flex-none sm:min-w-[240px] max-w-[360px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar congelado por nome, motivo, descrição…"
            className="w-full bg-white/[0.06] hover:bg-white/[0.1] focus:bg-white/[0.1] transition border border-white/15 focus:border-sky-400/60 rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-white placeholder:text-white/40 outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3 sm:gap-4 overflow-x-auto px-3 sm:px-6 pb-6 col-scroll">
        {state.columns.map((col, idx) => {
          const visibleIds = filterCardIds(col.cardIds);
          // Esconde colunas vazias depois do filtro (não polui visual);
          // sem filtro mostramos todas, inclusive vazias, pra dar visão geral
          if (searchTerm && visibleIds.length === 0) return null;
          return (
            <Column
              key={col.id}
              column={{ ...col, cardIds: visibleIds }}
              cards={visibleIds.map((id) => state.cards[id]).filter(Boolean)}
              totalLabel={formatBRL(columnTotal(visibleIds))}
              isFirst={idx === 0}
              onAddCard={() => {
                /* sem ação — Congelados não cria deal direto */
              }}
              onDeleteCard={() => {
                /* sem ação na v1 */
              }}
              onOpenDealEdit={(name) =>
                setRoute(openEditarNegocio(name))
              }
              // Sem onChangeStage → Card não monta o dropdown de fase
              // (e o DealEditModal externo continua funcionando normal).
            />
          );
        })}
      </div>

      {/* Ficha do congelado (read-only) — mostra detalhes do motivo de
          perda e descrição. Modal independente do Board principal: o
          state.cards do Board é só do Roberto e não inclui congelados
          de outros vendedores. */}
      {route.modal === "editarNegocio" &&
        (() => {
          const options = Object.values(state.cards).map((c) => ({
            id: c.id,
            name: c.title,
          }));
          const match = findDealByQuery(route.cliente, options);
          if (!match) return null;
          const card = state.cards[match.id];
          if (!card) return null;
          return (
            <CongeladoCardModal
              card={card}
              onClose={() => setRoute(closeModal())}
            />
          );
        })()}
    </>
  );
}

function CongeladoCardModal({
  card,
  onClose,
}: {
  card: CardT;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white shadow-2xl w-full sm:max-w-lg flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
              {card.title}
            </h2>
            <div className="text-[11px] text-rose-600 uppercase tracking-wide font-medium mt-0.5">
              ❄️ Congelado
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition text-lg w-10 h-10 flex items-center justify-center -mr-2"
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {card.congeladoMotivos && card.congeladoMotivos.length > 0 && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-2">
                Motivo(s) de perda
              </div>
              <div className="flex flex-wrap gap-1.5">
                {card.congeladoMotivos.map((m) => (
                  <span
                    key={m}
                    className="text-[12px] bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {card.congeladoDescricao && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-2">
                Descrição do motivo
              </div>
              <div className="text-sm text-slate-900 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-lg px-3.5 py-2.5 leading-relaxed">
                {card.congeladoDescricao}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Valor R
              </div>
              <div className="text-sm text-slate-900 font-medium">
                {formatBRL(card.recurring || 0)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Valor P
              </div>
              <div className="text-sm text-slate-900 font-medium">
                {formatBRL(card.pontual || 0)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Responsável original
              </div>
              <div className="text-sm text-slate-900">{card.responsible}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Fonte
              </div>
              <div className="text-sm text-slate-900">{card.source}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Congelado em
              </div>
              <div className="text-sm text-slate-900 inline-flex items-center gap-1.5">
                <span className="text-sky-500" aria-hidden>❄</span>
                <span>
                  {card.congeladoEm || card.dateLabel || "—"}
                </span>
                {card.congeladoEm && card.dateLabel && (
                  <span className="text-slate-400 text-[11px]">
                    ({card.dateLabel})
                  </span>
                )}
              </div>
            </div>
          </div>

          {card.proposalLink && (
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">
                Link da proposta
              </div>
              <a
                href={
                  /^(https?:|mailto:|tel:)/i.test(card.proposalLink)
                    ? card.proposalLink
                    : `https://${card.proposalLink}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-sky-600 hover:text-sky-800 underline break-all"
              >
                {card.proposalLink}
              </a>
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2 shrink-0 safe-bottom">
          {card.bitrixId && (
            <a
              href={`https://turbopartners.bitrix24.com.br/crm/deal/details/${card.bitrixId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-sky-600 hover:text-sky-800 underline"
            >
              Abrir no Bitrix ↗
            </a>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
