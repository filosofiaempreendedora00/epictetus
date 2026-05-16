"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { BoardState, Card as CardType } from "@/lib/types";
import { formatBRL } from "@/lib/initialData";
import Column from "./Column";
import Card from "./Card";
import Header from "./Header";

const EMPTY_STATE: BoardState = { columns: [], cards: {} };

export default function Board() {
  const [state, setState] = useState<BoardState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch board from Bitrix on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bitrix/board", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Erro ao carregar dados do Bitrix");
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function findColumnIdByCard(cardId: string) {
    return state.columns.find((c) => c.cardIds.includes(cardId))?.id;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    setActiveCard(state.cards[id] ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const fromColId = findColumnIdByCard(activeId);
    let toColId: string | undefined;

    const overIsColumn = state.columns.some((c) => c.id === overId);
    if (overIsColumn) {
      toColId = overId;
    } else {
      toColId = findColumnIdByCard(overId);
    }

    if (!fromColId || !toColId || fromColId === toColId) return;

    setState((prev) => {
      const fromCol = prev.columns.find((c) => c.id === fromColId)!;
      const toCol = prev.columns.find((c) => c.id === toColId)!;
      const newFromCardIds = fromCol.cardIds.filter((id) => id !== activeId);
      const overIndexInTo = toCol.cardIds.indexOf(overId);
      const insertAt = overIndexInTo === -1 ? toCol.cardIds.length : overIndexInTo;
      const newToCardIds = [
        ...toCol.cardIds.slice(0, insertAt),
        activeId,
        ...toCol.cardIds.slice(insertAt),
      ];

      const newColumns = prev.columns.map((c) =>
        c.id === fromColId
          ? { ...c, cardIds: newFromCardIds }
          : c.id === toColId
          ? { ...c, cardIds: newToCardIds }
          : c
      );

      // Push the stage change to Bitrix (fire and forget — optimistic UI)
      const card = prev.cards[activeId];
      const targetCol = newColumns.find((c) => c.id === toColId);
      if (card?.bitrixId && targetCol?.stageId) {
        fetch(`/api/bitrix/deals/${card.bitrixId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stageId: targetCol.stageId }),
        }).catch(() => {
          /* TODO: rollback on failure */
        });
      }

      return { ...prev, columns: newColumns };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const colId = findColumnIdByCard(activeId);
    if (!colId) return;

    const overInSameColumn =
      findColumnIdByCard(overId) === colId && overId !== colId;
    if (!overInSameColumn) return;

    setState((prev) => {
      const col = prev.columns.find((c) => c.id === colId)!;
      const oldIndex = col.cardIds.indexOf(activeId);
      const newIndex = col.cardIds.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const newIds = arrayMove(col.cardIds, oldIndex, newIndex);
      return {
        ...prev,
        columns: prev.columns.map((c) =>
          c.id === colId ? { ...c, cardIds: newIds } : c
        ),
      };
    });
  }

  function handleAddCard(_columnId: string) {
    alert("Criação de negócio direto no Bitrix será adicionada em breve. Por enquanto, crie o negócio no Bitrix e ele aparecerá aqui.");
  }

  function handleDeleteCard(_cardId: string) {
    alert("Exclusão pelo Kanban ficará disponível em breve. Mova ou exclua o negócio no Bitrix.");
  }

  async function handleCreateTask(
    cardId: string,
    fields: { title: string; description: string }
  ) {
    const card = state.cards[cardId];
    if (!card?.bitrixId) {
      throw new Error("Negócio sem ID do Bitrix");
    }

    const res = await fetch("/api/bitrix/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, dealId: card.bitrixId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Falha ao criar tarefa no Bitrix");
    }
    const newTask = (await res.json()) as import("@/lib/types").DealTask;

    setState((s) => ({
      ...s,
      cards: {
        ...s.cards,
        [cardId]: {
          ...s.cards[cardId],
          tasks: [...(s.cards[cardId].tasks || []), newTask],
        },
      },
    }));
  }

  async function handleUpdateTask(
    cardId: string,
    taskId: string,
    fields: { title?: string; description?: string }
  ) {
    const card = state.cards[cardId];
    const taskIdx = card?.tasks?.findIndex((t) => t.id === taskId) ?? -1;
    if (taskIdx < 0 || !card?.tasks) {
      throw new Error("Tarefa não encontrada");
    }
    const prev = card.tasks[taskIdx];

    setState((s) => {
      const tasks = [...(s.cards[cardId].tasks || [])];
      tasks[taskIdx] = {
        ...tasks[taskIdx],
        ...(fields.title !== undefined && { title: fields.title }),
        ...(fields.description !== undefined && { description: fields.description }),
      };
      return {
        ...s,
        cards: { ...s.cards, [cardId]: { ...s.cards[cardId], tasks } },
      };
    });

    try {
      const res = await fetch(`/api/bitrix/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao salvar no Bitrix");
      }
    } catch (e: any) {
      setState((s) => {
        const tasks = [...(s.cards[cardId].tasks || [])];
        tasks[taskIdx] = prev;
        return {
          ...s,
          cards: { ...s.cards, [cardId]: { ...s.cards[cardId], tasks } },
        };
      });
      throw e;
    }
  }

  async function handleUpdateValue(
    cardId: string,
    field: "pontual" | "recurring",
    value: number
  ) {
    const current = state.cards[cardId];
    if (!current?.bitrixId) return;
    const prev = current[field] ?? 0;
    if (prev === value) return;

    setState((s) => ({
      ...s,
      cards: { ...s.cards, [cardId]: { ...s.cards[cardId], [field]: value } },
    }));

    try {
      const res = await fetch(`/api/bitrix/deals/${current.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "falha");
    } catch (e: any) {
      setState((s) => ({
        ...s,
        cards: { ...s.cards, [cardId]: { ...s.cards[cardId], [field]: prev } },
      }));
      alert(`Erro ao salvar valor no Bitrix: ${e?.message || ""}`);
    }
  }

  function columnTotal(colCardIds: string[]) {
    return colCardIds.reduce((sum, id) => {
      const c = state.cards[id];
      if (!c) return sum;
      return sum + (c.value || 0) + (c.pontual || 0) + (c.recurring || 0);
    }, 0);
  }

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
        false
      );
    });
  }

  if (loading) {
    return (
      <>
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        <div className="px-6 py-10 text-white/80 text-sm">
          Carregando negócios do Bitrix…
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        <div className="mx-6 my-6 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="font-medium mb-1">Não consegui conectar ao Bitrix</div>
          <div className="opacity-80">{error}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header searchTerm={searchTerm} onSearchChange={setSearchTerm} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto px-6 pb-6 col-scroll">
          {state.columns.map((col, idx) => {
            const visibleIds = filterCardIds(col.cardIds);
            return (
              <Column
                key={col.id}
                column={{ ...col, cardIds: visibleIds }}
                cards={visibleIds.map((id) => state.cards[id]).filter(Boolean)}
                totalLabel={formatBRL(columnTotal(visibleIds))}
                isFirst={idx === 0}
                onAddCard={() => handleAddCard(col.id)}
                onDeleteCard={handleDeleteCard}
                onUpdateValue={handleUpdateValue}
                onUpdateTask={handleUpdateTask}
                onCreateTask={handleCreateTask}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="rotate-2">
              <Card card={activeCard} columnId="overlay" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}
