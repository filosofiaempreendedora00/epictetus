"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card as CardType } from "@/lib/types";
import { formatBRL } from "@/lib/initialData";

type Props = {
  card: CardType;
  columnId: string;
  onDelete?: () => void;
};

export default function Card({ card, columnId, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: card.id,
      data: { type: "card", columnId },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group bg-white rounded-xl shadow-sm px-3 py-2.5 cursor-grab active:cursor-grabbing relative overflow-hidden"
    >
      {/* Delete (visible on hover) */}
      {onDelete && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1.5 right-2 opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-red-500 text-xs"
          title="Excluir"
        >
          ✕
        </button>
      )}

      {/* Title */}
      <h3 className="text-slate-900 font-medium leading-snug text-[13px]">
        {card.title}
      </h3>

      {/* Value */}
      <div className="mt-1.5 text-slate-900 font-semibold text-sm">
        R$ {card.value.toLocaleString("pt-BR")}
      </div>

      {/* Date */}
      <div className="text-slate-400 text-[11px] mt-0.5">{card.dateLabel}</div>

      {/* Person responsible */}
      <div className="mt-2 text-[11px] text-slate-500">Pessoa responsável</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[9px]">
          👤
        </div>
        <span className="text-sky-500 text-[13px] truncate">{card.responsible}</span>
      </div>

      {/* Source */}
      <div className="mt-1.5 text-[11px] text-slate-500">Fonte</div>
      <div className="text-slate-800 text-[13px] truncate">{card.source}</div>

      {/* Values */}
      {card.pontual !== undefined && (
        <>
          <div className="mt-2 text-xs text-slate-500">Valor Pontual</div>
          <div className="text-slate-800 text-sm">{formatBRL(card.pontual)}</div>
        </>
      )}

      {card.recurring !== undefined && (
        <>
          <div className="mt-2 text-xs text-slate-500">Valor Recorrente</div>
          <div className="text-slate-800 text-sm">{formatBRL(card.recurring)}</div>
        </>
      )}

      {/* SDR */}
      {card.sdr && (
        <>
          <div className="mt-2 text-xs text-slate-500">SDR</div>
          <div className="text-sky-500 text-sm">{card.sdr}</div>
        </>
      )}

      {/* Task badge */}
      {card.taskStatus && (
        <>
          <div className="mt-2 text-xs text-slate-500">Tarefa</div>
          <span
            className={`inline-block mt-0.5 text-[11px] font-semibold px-2 py-1 rounded ${
              card.taskStatus === "ATRASADA"
                ? "bg-red-100 text-red-600"
                : "bg-sky-100 text-sky-600"
            }`}
          >
            {card.taskStatus}
          </span>
        </>
      )}

      {/* Footer hint */}
      <div className="mt-2 pt-1.5 border-t border-slate-100 text-slate-400 text-[12px]">
        + Atividade
      </div>
    </div>
  );
}
