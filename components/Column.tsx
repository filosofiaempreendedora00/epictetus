"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column as ColumnType, Card as CardType } from "@/lib/types";
import Card from "./Card";

type Props = {
  column: ColumnType;
  cards: CardType[];
  totalLabel: string;
  isFirst?: boolean;
  onAddCard: () => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateValue?: (cardId: string, field: "pontual" | "recurring", value: number) => void;
  onUpdateTask?: (cardId: string, taskId: string, fields: { title?: string; description?: string; deadline?: string | null }) => Promise<void>;
  onCreateTask?: (cardId: string, fields: { title: string; description: string; deadline?: string | null }) => Promise<void>;
  onCompleteTask?: (cardId: string, taskId: string) => Promise<void>;
  allStages?: Array<{ stageId: string; title: string }>;
  onChangeStage?: (cardId: string, newStageId: string) => Promise<void>;
};

export default function Column({
  column,
  cards,
  totalLabel,
  isFirst,
  onAddCard,
  onDeleteCard,
  onUpdateValue,
  onUpdateTask,
  onCreateTask,
  onCompleteTask,
  allStages,
  onChangeStage,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  return (
    <div className="flex flex-col w-[230px] shrink-0">
      {/* Gradient header */}
      <div
        className={`bg-gradient-to-r ${column.color} rounded-t-2xl px-4 py-3 flex items-center justify-between shadow-md`}
      >
        <div className="flex items-center gap-1.5 text-white font-medium text-[13px] min-w-0">
          <span className="whitespace-nowrap truncate">{column.title}</span>
          <span className="text-white/80 shrink-0">{cards.length}</span>
        </div>
        <button
          className="text-white/80 hover:text-white w-6 h-6 rounded-full hover:bg-white/15 transition flex items-center justify-center"
          aria-label="Adicionar"
          onClick={onAddCard}
        >
          +
        </button>
      </div>

      {/* Total */}
      <div className="bg-white/[0.03] border-x border-white/5 px-4 py-2 text-center text-white/60 text-sm">
        {totalLabel}
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={`flex-1 px-2 py-2 space-y-2 col-scroll overflow-y-auto min-h-[200px] border-x border-white/5 transition ${
          isOver ? "bg-white/[0.04]" : ""
        }`}
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        {isFirst && cards.length === 0 && (
          <button
            onClick={onAddCard}
            className="w-full bg-white/[0.04] hover:bg-white/[0.07] border border-dashed border-white/10 rounded-xl py-3 text-white/60 text-sm transition flex items-center justify-center gap-2"
          >
            <span>+</span> Negócio rápido
          </button>
        )}

        {!isFirst && (
          <button
            onClick={onAddCard}
            className="w-full bg-white/[0.04] hover:bg-white/[0.07] border border-white/5 rounded-xl py-2 text-white/40 hover:text-white/70 transition text-lg"
          >
            +
          </button>
        )}

        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              columnId={column.id}
              onDelete={() => onDeleteCard(card.id)}
              onUpdateValue={onUpdateValue}
              onUpdateTask={onUpdateTask}
              onCreateTask={onCreateTask}
              onCompleteTask={onCompleteTask}
              allStages={allStages}
              currentStageId={column.stageId}
              onChangeStage={onChangeStage}
            />
          ))}
        </SortableContext>
      </div>

      {/* Bottom rounded corner */}
      <div className="bg-white/[0.02] border-x border-b border-white/5 rounded-b-2xl h-3" />
    </div>
  );
}
