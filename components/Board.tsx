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
import TasksView from "./TasksView";
import CongeladoModal from "./CongeladoModal";
import ReuniaoRealizadaModal from "./ReuniaoRealizadaModal";
import DealEditModal from "./DealEditModal";
import {
  closeModal,
  openEditarNegocio,
  useRoute,
  type ViewMode,
} from "@/lib/route";
import { findDealByQuery } from "@/lib/dateParams";

const LOSE_STAGE_ID = "LOSE";
const NEW_STAGE_ID = "NEW";

const EMPTY_STATE: BoardState = { columns: [], cards: {} };

export default function Board() {
  const [state, setState] = useState<BoardState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const { route, setRoute } = useRoute();
  const searchTerm = route.busca;
  const viewMode = route.view;
  const setSearchTerm = (v: string) => setRoute({ busca: v });
  const setViewMode = (v: ViewMode) => setRoute({ view: v });
  const [dragOriginColId, setDragOriginColId] = useState<string | null>(null);
  const [pendingCongelado, setPendingCongelado] = useState<{
    cardId: string;
    originColId: string;
  } | null>(null);
  const [pendingReuniaoExit, setPendingReuniaoExit] = useState<{
    cardId: string;
    originColId: string;
    targetStageId: string;
    targetStageName: string;
  } | null>(null);

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
    setDragOriginColId(findColumnIdByCard(id) ?? null);
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
      // EXCETO se for Congelado ou saída de "Reunião realizada":
      // aguardamos os modais preencherem os campos obrigatórios.
      const card = prev.cards[activeId];
      const targetCol = newColumns.find((c) => c.id === toColId);
      const fromColStageId = prev.columns.find((c) => c.id === fromColId)?.stageId;
      const isLose = targetCol?.stageId === LOSE_STAGE_ID;
      const isExitingReuniao =
        fromColStageId === NEW_STAGE_ID && targetCol?.stageId !== NEW_STAGE_ID;
      if (!isLose && !isExitingReuniao && card?.bitrixId && targetCol?.stageId) {
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

    const activeId = active.id as string;
    const finalColId = findColumnIdByCard(activeId);
    const finalCol = state.columns.find((c) => c.id === finalColId);
    const origin = dragOriginColId;
    setDragOriginColId(null);

    // Se o card foi parar em Congelado vindo de outra coluna, abre o modal
    if (
      finalCol?.stageId === LOSE_STAGE_ID &&
      origin &&
      origin !== finalColId
    ) {
      setPendingCongelado({ cardId: activeId, originColId: origin });
      return;
    }

    // Se o card saiu de "Reunião realizada" (NEW) para outra coluna, abre
    // o modal com 15 campos obrigatórios
    const originCol = state.columns.find((c) => c.id === origin);
    if (
      originCol?.stageId === NEW_STAGE_ID &&
      finalCol &&
      finalCol.stageId !== NEW_STAGE_ID &&
      origin &&
      origin !== finalColId
    ) {
      setPendingReuniaoExit({
        cardId: activeId,
        originColId: origin,
        targetStageId: finalCol.stageId!,
        targetStageName: finalCol.title,
      });
      return;
    }

    if (!over) return;
    const overId = over.id as string;
    if (activeId === overId) return;

    const colId = finalColId;
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

  async function handleChangeStage(cardId: string, newStageId: string) {
    const card = state.cards[cardId];
    if (!card?.bitrixId) return;

    const fromCol = state.columns.find((c) => c.cardIds.includes(cardId));
    const toCol = state.columns.find((c) => c.stageId === newStageId);
    if (!fromCol || !toCol || fromCol.id === toCol.id) return;

    // Mover para Congelado exige preencher campos obrigatórios → abre modal
    if (newStageId === LOSE_STAGE_ID) {
      setPendingCongelado({ cardId, originColId: fromCol.id });
      return;
    }

    // Sair de "Reunião realizada" exige 15 campos obrigatórios → abre modal
    if (fromCol.stageId === NEW_STAGE_ID && newStageId !== NEW_STAGE_ID) {
      setPendingReuniaoExit({
        cardId,
        originColId: fromCol.id,
        targetStageId: newStageId,
        targetStageName: toCol.title,
      });
      return;
    }

    const prevFromIds = fromCol.cardIds;
    const prevToIds = toCol.cardIds;

    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => {
        if (c.id === fromCol.id) {
          return { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) };
        }
        if (c.id === toCol.id) {
          return { ...c, cardIds: [cardId, ...c.cardIds] };
        }
        return c;
      }),
    }));

    try {
      const res = await fetch(`/api/bitrix/deals/${card.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: newStageId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao mudar a fase no Bitrix");
      }
    } catch (e: any) {
      setState((s) => ({
        ...s,
        columns: s.columns.map((c) => {
          if (c.id === fromCol.id) return { ...c, cardIds: prevFromIds };
          if (c.id === toCol.id) return { ...c, cardIds: prevToIds };
          return c;
        }),
      }));
      throw e;
    }
  }

  function moveCardBetweenColumns(
    s: BoardState,
    cardId: string,
    fromColId: string,
    toColId: string
  ): BoardState {
    if (fromColId === toColId) return s;
    return {
      ...s,
      columns: s.columns.map((c) => {
        if (c.id === fromColId) {
          return { ...c, cardIds: c.cardIds.filter((id) => id !== cardId) };
        }
        if (c.id === toColId) {
          return { ...c, cardIds: [cardId, ...c.cardIds] };
        }
        return c;
      }),
    };
  }

  async function handleConfirmCongelado(fields: {
    motivoIds: string[];
    descricao: string;
    servicoIds: string[];
  }) {
    if (!pendingCongelado) return;
    const { cardId, originColId } = pendingCongelado;
    const card = state.cards[cardId];
    if (!card?.bitrixId) return;

    const loseCol = state.columns.find((c) => c.stageId === LOSE_STAGE_ID);
    const currentColId = findColumnIdByCard(cardId);
    // Visualmente move pra Congelado se ainda não está lá (caso veio do
    // DealEditModal/dropdown, em que pulamos o move otimista)
    if (loseCol && currentColId && currentColId !== loseCol.id) {
      setState((s) => moveCardBetweenColumns(s, cardId, currentColId, loseCol.id));
    }

    try {
      const res = await fetch(`/api/bitrix/deals/${card.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: LOSE_STAGE_ID,
          motivoIds: fields.motivoIds,
          descricao: fields.descricao,
          servicoIds: fields.servicoIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao congelar negócio no Bitrix");
      }
      setPendingCongelado(null);
    } catch (e: any) {
      // Rollback: card volta pra coluna de origem
      const nowColId = findColumnIdByCard(cardId);
      if (nowColId && nowColId !== originColId) {
        setState((s) => moveCardBetweenColumns(s, cardId, nowColId, originColId));
      }
      setPendingCongelado(null);
      throw e;
    }
  }

  function handleCancelCongelado() {
    if (!pendingCongelado) return;
    const { cardId, originColId } = pendingCongelado;
    const currentColId = findColumnIdByCard(cardId);
    if (currentColId && currentColId !== originColId) {
      setState((s) => moveCardBetweenColumns(s, cardId, currentColId, originColId));
    }
    setPendingCongelado(null);
  }

  async function handleConfirmReuniaoExit(reuniaoData: Record<string, any>) {
    if (!pendingReuniaoExit) return;
    const { cardId, originColId, targetStageId } = pendingReuniaoExit;
    const card = state.cards[cardId];
    if (!card?.bitrixId) return;

    const targetCol = state.columns.find((c) => c.stageId === targetStageId);
    const currentColId = findColumnIdByCard(cardId);
    if (targetCol && currentColId && currentColId !== targetCol.id) {
      setState((s) => moveCardBetweenColumns(s, cardId, currentColId, targetCol.id));
    }

    try {
      const res = await fetch(`/api/bitrix/deals/${card.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId: targetStageId,
          reuniaoData,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao salvar no Bitrix");
      }
      setPendingReuniaoExit(null);
    } catch (e: any) {
      // Rollback: card volta pra coluna de origem
      const nowColId = findColumnIdByCard(cardId);
      if (nowColId && nowColId !== originColId) {
        setState((s) => moveCardBetweenColumns(s, cardId, nowColId, originColId));
      }
      setPendingReuniaoExit(null);
      throw e;
    }
  }

  function handleCancelReuniaoExit() {
    if (!pendingReuniaoExit) return;
    const { cardId, originColId } = pendingReuniaoExit;
    const currentColId = findColumnIdByCard(cardId);
    if (currentColId && currentColId !== originColId) {
      setState((s) => moveCardBetweenColumns(s, cardId, currentColId, originColId));
    }
    setPendingReuniaoExit(null);
  }

  async function handleCompleteTask(cardId: string, taskId: string) {
    const card = state.cards[cardId];
    const taskIdx = card?.tasks?.findIndex((t) => t.id === taskId) ?? -1;
    if (taskIdx < 0 || !card?.tasks) return;
    const prevTask = card.tasks[taskIdx];

    setState((s) => {
      const tasks = (s.cards[cardId].tasks || []).filter((t) => t.id !== taskId);
      return {
        ...s,
        cards: { ...s.cards, [cardId]: { ...s.cards[cardId], tasks } },
      };
    });

    try {
      const res = await fetch(`/api/bitrix/tasks/${taskId}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao concluir no Bitrix");
      }
    } catch (e: any) {
      setState((s) => {
        const tasks = [...(s.cards[cardId].tasks || [])];
        tasks.splice(taskIdx, 0, prevTask);
        return {
          ...s,
          cards: { ...s.cards, [cardId]: { ...s.cards[cardId], tasks } },
        };
      });
      throw e;
    }
  }

  async function handleCreateTask(
    cardId: string,
    fields: { title: string; description: string; deadline?: string | null }
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
    fields: { title?: string; description?: string; deadline?: string | null }
  ) {
    const card = state.cards[cardId];
    const taskIdx = card?.tasks?.findIndex((t) => t.id === taskId) ?? -1;
    if (taskIdx < 0 || !card?.tasks) {
      throw new Error("Tarefa não encontrada");
    }
    const prev = card.tasks[taskIdx];

    setState((s) => {
      const tasks = [...(s.cards[cardId].tasks || [])];
      const now = Date.now();
      const newDeadline =
        fields.deadline !== undefined ? fields.deadline : tasks[taskIdx].deadline;
      tasks[taskIdx] = {
        ...tasks[taskIdx],
        ...(fields.title !== undefined && { title: fields.title }),
        ...(fields.description !== undefined && { description: fields.description }),
        ...(fields.deadline !== undefined && { deadline: fields.deadline }),
        overdue: newDeadline ? new Date(newDeadline).getTime() < now : false,
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

  async function handleUpdateProposalLink(cardId: string, link: string) {
    const current = state.cards[cardId];
    if (!current?.bitrixId) return;
    const prev = current.proposalLink ?? "";
    const next = link.trim();
    if (prev === next) return;

    setState((s) => ({
      ...s,
      cards: {
        ...s.cards,
        [cardId]: { ...s.cards[cardId], proposalLink: next || undefined },
      },
    }));

    try {
      const res = await fetch(`/api/bitrix/deals/${current.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalLink: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao salvar link");
      }
    } catch (e: any) {
      setState((s) => ({
        ...s,
        cards: {
          ...s.cards,
          [cardId]: { ...s.cards[cardId], proposalLink: prev || undefined },
        },
      }));
      alert(`Erro ao salvar link da proposta: ${e?.message || ""}`);
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

  return (
    <>
      <Header
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === "tarefas" ? (
        <TasksView searchTerm={searchTerm} />
      ) : loading ? (
        <div className="px-6 py-10 text-white/80 text-sm">
          Carregando negócios do Bitrix…
        </div>
      ) : error ? (
        <div className="mx-6 my-6 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="font-medium mb-1">Não consegui conectar ao Bitrix</div>
          <div className="opacity-80">{error}</div>
        </div>
      ) : (
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
                  onCompleteTask={handleCompleteTask}
                  onUpdateProposalLink={handleUpdateProposalLink}
                  allStages={state.columns
                    .filter((c) => c.stageId)
                    .map((c) => ({ stageId: c.stageId!, title: c.title }))}
                  onChangeStage={handleChangeStage}
                  onOpenDealEdit={(name) =>
                    setRoute(openEditarNegocio(name))
                  }
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
      )}

      {pendingCongelado && state.loseFieldOptions && (
        <CongeladoModal
          cardTitle={state.cards[pendingCongelado.cardId]?.title || ""}
          motivoOptions={state.loseFieldOptions.motivo}
          servicosOptions={state.loseFieldOptions.servicos}
          onCancel={handleCancelCongelado}
          onConfirm={handleConfirmCongelado}
        />
      )}

      {pendingReuniaoExit && state.reuniaoFieldOptions && (
        <ReuniaoRealizadaModal
          cardTitle={state.cards[pendingReuniaoExit.cardId]?.title || ""}
          targetStageName={pendingReuniaoExit.targetStageName}
          fieldOptions={state.reuniaoFieldOptions}
          onCancel={handleCancelReuniaoExit}
          onConfirm={handleConfirmReuniaoExit}
        />
      )}

      {/* Modal "Editar negócio" controlado pelo path — /negocios/<nome> */}
      {(() => {
        if (route.modal !== "editarNegocio") return null;
        const dealOptions = Object.values(state.cards)
          .filter((c) => !!c.bitrixId)
          .map((c) => ({ id: c.id, name: c.title }));
        const match = findDealByQuery(route.cliente, dealOptions);
        if (!match) return null;
        const card = state.cards[match.id];
        const currentColId = findColumnIdByCard(match.id);
        const currentCol = state.columns.find((c) => c.id === currentColId);
        const allStages = state.columns
          .filter((c) => c.stageId)
          .map((c) => ({ stageId: c.stageId!, title: c.title }));
        return (
          <DealEditModal
            cardTitle={card.title}
            currentStageId={currentCol?.stageId}
            stages={allStages}
            onClose={() => setRoute(closeModal())}
            onSave={(newStageId) => handleChangeStage(match.id, newStageId)}
          />
        );
      })()}
    </>
  );
}
