"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card as CardType } from "@/lib/types";
import { formatBRL } from "@/lib/initialData";

type Props = {
  card: CardType;
  columnId: string;
  onDelete?: () => void;
  onUpdateValue?: (cardId: string, field: "pontual" | "recurring", value: number) => void;
};

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatTaskDeadline(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `hoje ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (isTomorrow) return "amanhã";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function parseInputToNumber(raw: string): number {
  if (!raw) return 0;
  // aceita "9997", "9997,50", "9.997,50", "9997.50"
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let cleaned: string;
  if (lastComma > lastDot) {
    cleaned = raw.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = raw.replace(/,/g, "");
  }
  const n = parseFloat(cleaned.replace(/[^\d.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function MoneyRow({
  label,
  value,
  onSave,
}: {
  label: "R" | "P";
  value: number;
  onSave?: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isZero = !value;
  const canEdit = !!onSave;

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(String(value || 0));
    setEditing(true);
  }

  function commit() {
    const n = parseInputToNumber(draft);
    setEditing(false);
    if (onSave && n !== value) onSave(n);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap shrink-0">
          Valor {label}
        </span>
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={draft}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="w-20 text-[12px] px-1.5 py-0.5 border border-sky-400 rounded outline-none text-slate-900"
        />
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-1.5 group/v">
      <span className="text-slate-500 text-[10px] font-medium uppercase tracking-wide whitespace-nowrap shrink-0">
        Valor {label}
      </span>
      <span
        className={`text-[12px] whitespace-nowrap ${
          isZero ? "text-slate-600" : "text-slate-900 font-semibold"
        }`}
      >
        {formatBRL(value || 0)}
      </span>
      {canEdit && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={startEdit}
          className="opacity-25 hover:opacity-100 transition text-slate-500 hover:text-sky-600"
          title={`Editar Valor ${label}`}
          aria-label={`Editar Valor ${label}`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Card({ card, columnId, onDelete, onUpdateValue }: Props) {
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
      <h3 className="text-slate-900 font-medium leading-snug text-[12px]">
        {card.title}
      </h3>

      {/* Valores R e P (sempre visíveis, editáveis) */}
      <div className="mt-1.5 space-y-0.5">
        <MoneyRow
          label="R"
          value={card.recurring || 0}
          onSave={
            onUpdateValue ? (n) => onUpdateValue(card.id, "recurring", n) : undefined
          }
        />
        <MoneyRow
          label="P"
          value={card.pontual || 0}
          onSave={
            onUpdateValue ? (n) => onUpdateValue(card.id, "pontual", n) : undefined
          }
        />
      </div>

      {/* Date */}
      <div className="text-slate-400 text-[10px] mt-1">{card.dateLabel}</div>

      {/* Person responsible */}
      <div className="mt-2 text-[10px] text-slate-500">Pessoa responsável</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[9px]">
          👤
        </div>
        <span className="text-sky-500 text-[12px] truncate">{card.responsible}</span>
      </div>

      {/* Source */}
      <div className="mt-1.5 text-[10px] text-slate-500">Fonte</div>
      <div className="text-slate-800 text-[12px] truncate">{card.source}</div>

      {/* SDR */}
      {card.sdr && (
        <>
          <div className="mt-2 text-[10px] text-slate-500">SDR</div>
          <div className="text-sky-500 text-[12px]">{card.sdr}</div>
        </>
      )}

      {/* Task badge */}
      {card.taskStatus && (
        <>
          <div className="mt-2 text-[10px] text-slate-500">Tarefa</div>
          <span
            className={`inline-block mt-0.5 text-[10px] font-semibold px-2 py-1 rounded ${
              card.taskStatus === "ATRASADA"
                ? "bg-red-100 text-red-600"
                : "bg-sky-100 text-sky-600"
            }`}
          >
            {card.taskStatus}
          </span>
        </>
      )}

      {/* Tarefas */}
      <div className="mt-2 pt-1.5 border-t border-slate-100">
        {card.tasks && card.tasks.length > 0 ? (
          <ul className="space-y-0.5">
            {card.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-baseline gap-1.5 text-[11px]"
                title={task.title}
              >
                <span
                  className={`leading-none shrink-0 ${
                    task.overdue ? "text-red-500" : "text-slate-400"
                  }`}
                >
                  •
                </span>
                <span
                  className={`flex-1 truncate ${
                    task.overdue ? "text-red-600 font-medium" : "text-slate-700"
                  }`}
                >
                  {task.title}
                </span>
                {task.deadline && (
                  <span
                    className={`shrink-0 text-[10px] whitespace-nowrap ${
                      task.overdue ? "text-red-500" : "text-slate-400"
                    }`}
                  >
                    {formatTaskDeadline(task.deadline)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-slate-400 text-[11px]">+ Criar tarefa</div>
        )}
      </div>
    </div>
  );
}
