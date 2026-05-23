"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { TasksBoardState, TaskCard } from "@/lib/types";
import {
  TASK_TYPE_COLORS,
  TASK_TYPE_INFO,
  TASK_TYPE_ORDER,
  inferTaskType,
  type TaskType,
} from "@/lib/taskTypes";
import TaskEditModal from "./TaskEditModal";
import { useUrlIntState, useUrlState } from "@/lib/useUrlState";

const EMPTY: TasksBoardState = { tasks: {} };

const DOW_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const PT_MONTH_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

type DateView = "weekly" | "biweekly" | "monthly";

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function startOfWeekSunday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function dateToBitrixISO(d: Date): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absMin = Math.abs(offset);
  const hh = pad2(Math.floor(absMin / 60));
  const mm = pad2(absMin % 60);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${hh}:${mm}`;
}

export default function TasksView({ searchTerm }: { searchTerm: string }) {
  const [state, setState] = useState<TasksBoardState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateView, setDateView] = useUrlState<DateView>("dateView", "weekly");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingForDate, setCreatingForDate] = useState<Date | null>(null);
  const [creatingForDealId, setCreatingForDealId] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useUrlIntState("week", 0); // semanas a partir da semana atual

  async function handleCopyPhone(phone: string) {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
    } catch {
      // Fallback pra contextos sem permissão de clipboard
      const ta = document.createElement("textarea");
      ta.value = phone;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    setCopiedPhone(phone);
    window.setTimeout(() => setCopiedPhone(null), 2200);
  }
  const [typeFilter, setTypeFilter] = useUrlState<TaskType | "ALL">(
    "type",
    "ALL"
  );

  const editingTask = editingTaskId ? state.tasks[editingTaskId] : null;
  const draggedTask = draggedTaskId ? state.tasks[draggedTaskId] : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function handleCreateTask(fields: {
    title: string;
    description: string;
    deadline: string | null;
    dealId?: string;
  }) {
    if (!fields.dealId) throw new Error("Selecione o negócio do Kanban");
    let res: Response;
    try {
      res = await fetch("/api/bitrix/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.title,
          description: fields.description,
          dealId: fields.dealId,
          deadline: fields.deadline,
        }),
      });
    } catch (netErr: any) {
      // "Failed to fetch" geralmente acontece em cold start do Render —
      // o serviço estava dormindo. Mensagem mais explicativa.
      throw new Error(
        "Servidor demorou pra responder (provável cold start do Render). Aguarde alguns segundos e tente novamente."
      );
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Falha ao criar tarefa no Bitrix");
    }
    const created = (await res.json()) as {
      id: string;
      title: string;
      description?: string;
      deadline: string | null;
    };
    const dealName = state.deals?.find((d) => d.id === fields.dealId)?.name;
    const newId = `task-${created.id}`;
    const newCard: TaskCard = {
      id: newId,
      bitrixId: String(created.id),
      title: created.title,
      description: created.description || "",
      deadline: created.deadline,
      dealId: fields.dealId,
      dealName,
      type: inferTaskType(created.title),
    };
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [newId]: newCard },
    }));
  }

  async function handleCompleteTask() {
    if (!editingTask) return;
    const prev = editingTask;
    setState((s) => {
      const rest = { ...s.tasks };
      delete rest[prev.id];
      return { ...s, tasks: rest };
    });
    try {
      const res = await fetch(
        `/api/bitrix/tasks/${prev.bitrixId}/complete`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao concluir no Bitrix");
      }
      // Após concluir com sucesso, encadeia abertura do modal de criação
      // de uma nova tarefa com o mesmo negócio já pré-selecionado.
      setEditingTaskId(null);
      if (prev.dealId) setCreatingForDealId(prev.dealId);
      setCreatingTask(true);
    } catch (e: any) {
      setState((s) => ({
        ...s,
        tasks: { ...s.tasks, [prev.id]: prev },
      }));
      throw e;
    }
  }

  async function handleSaveTask(fields: {
    title: string;
    description: string;
    deadline: string | null;
  }) {
    if (!editingTask) return;
    const prev = editingTask;
    setState((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [prev.id]: {
          ...s.tasks[prev.id],
          title: fields.title,
          description: fields.description,
          deadline: fields.deadline,
        },
      },
    }));
    try {
      const res = await fetch(`/api/bitrix/tasks/${prev.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao salvar no Bitrix");
      }
    } catch (e: any) {
      setState((s) => ({ ...s, tasks: { ...s.tasks, [prev.id]: prev } }));
      throw e;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggedTaskId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggedTaskId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const targetKey = String(over.id);
    const task = state.tasks[taskId];
    if (!task?.deadline) return;

    const currentDate = new Date(task.deadline);
    if (isNaN(currentDate.getTime())) return;
    if (dayKey(currentDate) === targetKey) return;

    const targetDate = parseDayKey(targetKey);
    if (!targetDate) return;

    const newDate = new Date(targetDate);
    newDate.setHours(
      currentDate.getHours(),
      currentDate.getMinutes(),
      currentDate.getSeconds()
    );
    const newDeadlineIso = dateToBitrixISO(newDate);

    const prev = task;
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [taskId]: { ...task, deadline: newDeadlineIso } },
    }));

    try {
      const res = await fetch(`/api/bitrix/tasks/${task.bitrixId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: newDeadlineIso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Falha ao salvar no Bitrix");
      }
    } catch (e: any) {
      setState((s) => ({ ...s, tasks: { ...s.tasks, [taskId]: prev } }));
      alert(`Erro ao mover tarefa: ${e?.message || ""}`);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bitrix/tasks", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(data?.error || "Erro ao carregar tarefas");
        else setState(data as TasksBoardState);
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

  const tasksByDay = useMemo(() => {
    const m = new Map<string, TaskCard[]>();
    const q = searchTerm.trim().toLowerCase();
    for (const t of Object.values(state.tasks)) {
      if (!t.deadline) continue;
      if (typeFilter !== "ALL" && t.type !== typeFilter) continue;
      if (q) {
        const matches =
          t.title.toLowerCase().includes(q) ||
          t.dealName?.toLowerCase().includes(q);
        if (!matches) continue;
      }
      const d = new Date(t.deadline);
      if (isNaN(d.getTime())) continue;
      const key = dayKey(d);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.deadline || "").localeCompare(b.deadline || ""));
    }
    return m;
  }, [state.tasks, searchTerm, typeFilter]);

  // Contagem por tipo (pra exibir nos botões)
  const countByType = useMemo(() => {
    const counts: Record<TaskType | "ALL", number> = {
      ALL: 0,
      FUP: 0,
      R2R3: 0,
      PROPOSTA: 0,
      OUTRO: 0,
    };
    for (const t of Object.values(state.tasks)) {
      if (!t.deadline) continue;
      counts.ALL++;
      counts[t.type]++;
    }
    return counts;
  }, [state.tasks]);

  if (loading) {
    return (
      <div className="px-6 py-10 text-white/80 text-sm">
        Carregando tarefas do Bitrix…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-6 my-6 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
        <div className="font-medium mb-1">Não consegui carregar tarefas</div>
        <div className="opacity-80">{error}</div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-6">
      {/* Filtro por tipo (estilo neutro — a cor fica nos cards) */}
      <div className="mb-2 flex items-center gap-1.5 flex-wrap">
        {(["ALL", ...TASK_TYPE_ORDER] as const).map((t) => {
          const active = typeFilter === t;
          const label =
            t === "ALL" ? "Todas as tarefas" : TASK_TYPE_INFO[t].label;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`text-[12px] px-3 py-1 rounded-full border transition ${
                active
                  ? "bg-white text-slate-900 border-white font-medium"
                  : "bg-white/[0.06] text-white/70 border-white/15 hover:bg-white/[0.12] hover:text-white"
              }`}
            >
              {label}{" "}
              <span className="opacity-60">({countByType[t]})</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <DateViewSwitcher value={dateView} onChange={setDateView} />
        <button
          type="button"
          onClick={() => setCreatingTask(true)}
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition shadow-md shadow-emerald-500/20"
        >
          <span className="text-base leading-none">+</span> Criar tarefa
        </button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {dateView === "monthly" ? (
          <MonthlyView
            tasksByDay={tasksByDay}
            onTaskClick={setEditingTaskId}
            onCopyPhone={handleCopyPhone}
          />
        ) : (
          <DayColumnsView
            tasksByDay={tasksByDay}
            days={dateView === "weekly" ? 7 : 14}
            weekOffset={weekOffset}
            onWeekOffsetChange={setWeekOffset}
            onTaskClick={setEditingTaskId}
            onCreateTaskForDay={(d) => {
              setCreatingForDate(d);
              setCreatingTask(true);
            }}
            onCopyPhone={handleCopyPhone}
          />
        )}

        <DragOverlay>
          {draggedTask && (
            <div className="bg-white rounded-md shadow-xl px-2 py-1.5 rotate-2 cursor-grabbing min-w-[140px] max-w-[200px]">
              {draggedTask.dealName && (
                <div className="text-[9px] text-sky-600 leading-snug break-words">
                  {draggedTask.dealName}
                </div>
              )}
              <div className="text-slate-900 text-[11px] font-medium leading-snug break-words">
                {draggedTask.title}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {editingTask && (
        <TaskEditModal
          heading="Editar tarefa"
          initialTitle={editingTask.title}
          initialDescription={editingTask.description}
          initialDeadline={editingTask.deadline}
          linkedDealName={editingTask.dealName}
          saveLabel="Salvar alterações"
          onClose={() => setEditingTaskId(null)}
          onSave={handleSaveTask}
          onComplete={handleCompleteTask}
        />
      )}

      {creatingTask && (
        <TaskEditModal
          heading="Nova tarefa"
          initialTitle=""
          initialDescription=""
          initialDeadline={
            creatingForDate
              ? (() => {
                  const d = new Date(creatingForDate);
                  d.setHours(20, 0, 0, 0);
                  return dateToBitrixISO(d);
                })()
              : null
          }
          initialDealId={creatingForDealId}
          dealsForSelect={state.deals || []}
          saveLabel="Criar"
          onClose={() => {
            setCreatingTask(false);
            setCreatingForDate(null);
            setCreatingForDealId(null);
          }}
          onSave={handleCreateTask}
        />
      )}

      {copiedPhone && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[60] bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 pointer-events-none">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>Número copiado: {copiedPhone}</span>
        </div>
      )}
    </div>
  );
}

function DateViewSwitcher({
  value,
  onChange,
}: {
  value: DateView;
  onChange: (v: DateView) => void;
}) {
  const opts: { key: DateView; label: string }[] = [
    { key: "weekly", label: "Semanal" },
    { key: "biweekly", label: "2 Semanas" },
    { key: "monthly", label: "Mensal" },
  ];
  return (
    <div className="inline-flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-[12px] rounded-md transition ${
            value === o.key
              ? "bg-white/15 text-white font-medium shadow-sm"
              : "text-white/55 hover:text-white/85"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DayColumnsView({
  tasksByDay,
  days,
  weekOffset,
  onWeekOffsetChange,
  onTaskClick,
  onCreateTaskForDay,
  onCopyPhone,
}: {
  tasksByDay: Map<string, TaskCard[]>;
  days: number;
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  onTaskClick: (taskId: string) => void;
  onCreateTaskForDay?: (date: Date) => void;
  onCopyPhone?: (phone: string) => void;
}) {
  const now = new Date();
  const start = addDays(startOfWeekSunday(now), weekOffset * 7);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const lastDay = dayList[dayList.length - 1];
  const weekSpan = days === 7 ? 1 : 2; // quantas semanas o botão "<" / ">" pula

  function formatRange(a: Date, b: Date) {
    const sameMonth = a.getMonth() === b.getMonth();
    const sameYear = a.getFullYear() === b.getFullYear();
    if (sameMonth && sameYear) {
      return `${a.getDate()} – ${b.getDate()} de ${PT_MONTH_LONG[a.getMonth()]} ${a.getFullYear()}`;
    }
    if (sameYear) {
      return `${a.getDate()} ${PT_MONTH_LONG[a.getMonth()]} – ${b.getDate()} ${PT_MONTH_LONG[b.getMonth()]} ${a.getFullYear()}`;
    }
    return `${a.getDate()} ${PT_MONTH_LONG[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${PT_MONTH_LONG[b.getMonth()]} ${b.getFullYear()}`;
  }

  return (
    <div>
      {/* Barra de navegação de semanas */}
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => onWeekOffsetChange(weekOffset - weekSpan)}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white transition"
          title="Semana anterior"
          aria-label="Semana anterior"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onWeekOffsetChange(weekOffset + weekSpan)}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white transition"
          title="Próxima semana"
          aria-label="Próxima semana"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div className="text-white/80 text-[13px] font-medium">
          {formatRange(start, lastDay)}
        </div>
        {weekOffset !== 0 && (
          <button
            type="button"
            onClick={() => onWeekOffsetChange(0)}
            className="ml-2 text-[12px] px-2 py-1 rounded-md border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white transition"
            title="Voltar pra semana atual"
          >
            Hoje
          </button>
        )}
      </div>

      <div className="border-t border-white/10">
      {/* Cabeçalho de dias */}
      <div className="flex">
        {dayList.map((d) => {
          const today = isSameDay(d, now);
          return (
            <div
              key={dayKey(d)}
              className="flex-1 min-w-0 border-r border-white/5 px-2 py-2 flex items-baseline gap-2"
            >
              <span className="text-white/40 text-[11px] uppercase tracking-wide">
                {DOW_SHORT[d.getDay()]}
              </span>
              {today ? (
                <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full w-5 h-5 inline-flex items-center justify-center">
                  {d.getDate()}
                </span>
              ) : (
                <span className="text-white/70 text-[12px] font-medium">
                  {d.getDate()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Colunas com tarefas */}
      <div className="flex" style={{ minHeight: "calc(100vh - 280px)" }}>
        {dayList.map((d) => (
          <DroppableDayColumn
            key={dayKey(d)}
            date={d}
            isToday={isSameDay(d, now)}
            tasks={tasksByDay.get(dayKey(d)) || []}
            onTaskClick={onTaskClick}
            onCreateTaskForDay={onCreateTaskForDay}
            onCopyPhone={onCopyPhone}
          />
        ))}
      </div>
      </div>
    </div>
  );
}

function DroppableDayColumn({
  date,
  isToday,
  tasks,
  onTaskClick,
  onCreateTaskForDay,
  onCopyPhone,
}: {
  date: Date;
  isToday: boolean;
  tasks: TaskCard[];
  onTaskClick: (taskId: string) => void;
  onCreateTaskForDay?: (date: Date) => void;
  onCopyPhone?: (phone: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 border-r border-white/5 p-1.5 space-y-1.5 col-scroll overflow-y-auto transition ${
        isOver
          ? "bg-sky-500/15 outline outline-1 outline-sky-400/50"
          : isToday
          ? "bg-white/[0.03]"
          : ""
      }`}
      style={{ maxHeight: "calc(100vh - 280px)" }}
    >
      {tasks.length === 0 && !onCreateTaskForDay && (
        <div className="text-center text-white/15 text-[10px] py-4 select-none">
          —
        </div>
      )}
      {tasks.map((t) => (
        <TaskMiniCard
          key={t.id}
          task={t}
          onClick={() => onTaskClick(t.id)}
          onCopyPhone={onCopyPhone}
        />
      ))}
      {onCreateTaskForDay && (
        <button
          type="button"
          onClick={() => onCreateTaskForDay(date)}
          className="w-full flex items-center justify-center py-1.5 rounded-md border border-dashed border-white/15 text-white/40 hover:text-white/90 hover:border-white/40 hover:bg-white/[0.04] transition text-[13px] leading-none"
          title="Nova tarefa neste dia"
        >
          +
        </button>
      )}
    </div>
  );
}

function MonthlyView({
  tasksByDay,
  onTaskClick,
  onCopyPhone,
}: {
  tasksByDay: Map<string, TaskCard[]>;
  onTaskClick: (taskId: string) => void;
  onCopyPhone?: (phone: string) => void;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = startOfWeekSunday(firstOfMonth);
  const gridEndExclusive = addDays(startOfWeekSunday(lastOfMonth), 7);
  const totalDays =
    (gridEndExclusive.getTime() - gridStart.getTime()) / (1000 * 60 * 60 * 24);
  const dayList = Array.from({ length: Math.round(totalDays) }, (_, i) =>
    addDays(gridStart, i)
  );

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-white/[0.02]">
      <div className="px-3 py-2 text-white/70 text-sm font-medium">
        {PT_MONTH_LONG[month]} {year}
      </div>
      <div className="grid grid-cols-7 border-t border-white/10">
        {DOW_SHORT.map((d) => (
          <div
            key={d}
            className="text-[10px] uppercase tracking-wide text-white/40 px-2 py-1 border-r border-white/5 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-white/10">
        {dayList.map((d) => (
          <DroppableMonthCell
            key={dayKey(d)}
            date={d}
            inMonth={d.getMonth() === month}
            isToday={isSameDay(d, now)}
            tasks={tasksByDay.get(dayKey(d)) || []}
            onTaskClick={onTaskClick}
            onCopyPhone={onCopyPhone}
          />
        ))}
      </div>
    </div>
  );
}

function DroppableMonthCell({
  date,
  inMonth,
  isToday,
  tasks,
  onTaskClick,
  onCopyPhone,
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  tasks: TaskCard[];
  onTaskClick: (taskId: string) => void;
  onCopyPhone?: (phone: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(date) });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[90px] border-r border-b border-white/5 p-1.5 last:border-r-0 transition ${
        isOver
          ? "bg-sky-500/15 outline outline-1 outline-sky-400/50"
          : !inMonth
          ? "bg-black/20"
          : isToday
          ? "bg-white/[0.04]"
          : ""
      }`}
    >
      <div className="flex items-center justify-end mb-1">
        {isToday ? (
          <span className="bg-red-500 text-white text-[10px] font-semibold rounded-full w-5 h-5 inline-flex items-center justify-center">
            {date.getDate()}
          </span>
        ) : (
          <span
            className={`text-[11px] ${
              inMonth ? "text-white/70" : "text-white/25"
            }`}
          >
            {date.getDate()}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {tasks.slice(0, 3).map((t) => (
          <MonthlyTaskItem
            key={t.id}
            task={t}
            onClick={() => onTaskClick(t.id)}
            onCopyPhone={onCopyPhone}
          />
        ))}
        {tasks.length > 3 && (
          <div className="text-[9px] text-white/40">
            +{tasks.length - 3} mais
          </div>
        )}
      </div>
    </div>
  );
}

function TaskMiniCard({
  task,
  onClick,
  onCopyPhone,
}: {
  task: TaskCard;
  onClick: () => void;
  onCopyPhone?: (phone: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const colors = TASK_TYPE_COLORS[task.type];
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "button, a, input, textarea, select"
          )
        )
          return;
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`relative w-full text-left rounded-md shadow-sm px-2 py-1.5 hover:shadow-md transition cursor-grab active:cursor-grabbing border ${colors.bg} ${colors.border} ${colors.hover}`}
      title={`${task.title} — clique para editar, arraste para mudar o dia`}
    >
      {task.phone && onCopyPhone && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCopyPhone(task.phone!);
          }}
          className="absolute top-1 right-1 opacity-80 hover:opacity-100 text-[#25D366] hover:text-[#1ebe5d] transition"
          title={`Copiar telefone (${task.phone})`}
          aria-label="Copiar telefone para WhatsApp"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.6 6.32A7.85 7.85 0 0 0 12 4a7.94 7.94 0 0 0-6.87 11.93L4 20l4.2-1.1A7.94 7.94 0 0 0 12 19.94a7.94 7.94 0 0 0 7.94-7.94 7.85 7.85 0 0 0-2.34-5.68Zm-5.6 12.22a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.49.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.24-3.48 6.6 6.6 0 0 1-6.66 6.57Zm3.62-4.92c-.2-.1-1.18-.58-1.36-.65s-.31-.1-.45.1-.51.65-.62.78-.23.15-.43.05a5.4 5.4 0 0 1-1.6-1 6 6 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4l.3-.35a1.4 1.4 0 0 0 .2-.34.36.36 0 0 0 0-.35c-.05-.1-.45-1.08-.62-1.48s-.33-.34-.45-.34h-.4a.78.78 0 0 0-.56.26 2.36 2.36 0 0 0-.73 1.75A4.1 4.1 0 0 0 8.43 13a9.34 9.34 0 0 0 3.57 3.17 12.2 12.2 0 0 0 1.2.44 2.9 2.9 0 0 0 1.32.08 2.15 2.15 0 0 0 1.41-1 1.74 1.74 0 0 0 .13-1c-.05-.08-.18-.13-.38-.23Z" />
          </svg>
        </button>
      )}
      {task.dealName && (
        <div
          className={`text-[9px] leading-snug break-words ${colors.deadline} ${
            task.phone ? "pr-5" : ""
          }`}
        >
          {task.dealName}
        </div>
      )}
      <div
        className={`text-[11px] font-medium leading-snug break-words ${colors.title} ${
          task.phone && !task.dealName ? "pr-5" : ""
        }`}
      >
        {task.title}
      </div>
    </div>
  );
}

function MonthlyTaskItem({
  task,
  onClick,
  onCopyPhone,
}: {
  task: TaskCard;
  onClick: () => void;
  onCopyPhone?: (phone: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const colors = TASK_TYPE_COLORS[task.type];
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "button, a, input, textarea, select"
          )
        )
          return;
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`relative block w-full text-left transition rounded px-1.5 py-1 leading-snug break-words cursor-grab active:cursor-grabbing border ${colors.bg} ${colors.border} ${colors.hover}`}
      title={
        task.dealName
          ? `${task.dealName} — ${task.title} — clique para editar, arraste para mudar o dia`
          : `${task.title} — clique para editar, arraste para mudar o dia`
      }
    >
      {task.phone && onCopyPhone && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCopyPhone(task.phone!);
          }}
          className="absolute top-0.5 right-0.5 opacity-80 hover:opacity-100 text-[#25D366] hover:text-[#1ebe5d] transition"
          title={`Copiar telefone (${task.phone})`}
          aria-label="Copiar telefone para WhatsApp"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.6 6.32A7.85 7.85 0 0 0 12 4a7.94 7.94 0 0 0-6.87 11.93L4 20l4.2-1.1A7.94 7.94 0 0 0 12 19.94a7.94 7.94 0 0 0 7.94-7.94 7.85 7.85 0 0 0-2.34-5.68Zm-5.6 12.22a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.49.65.67-2.43-.16-.25a6.59 6.59 0 1 1 12.24-3.48 6.6 6.6 0 0 1-6.66 6.57Zm3.62-4.92c-.2-.1-1.18-.58-1.36-.65s-.31-.1-.45.1-.51.65-.62.78-.23.15-.43.05a5.4 5.4 0 0 1-1.6-1 6 6 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4l.3-.35a1.4 1.4 0 0 0 .2-.34.36.36 0 0 0 0-.35c-.05-.1-.45-1.08-.62-1.48s-.33-.34-.45-.34h-.4a.78.78 0 0 0-.56.26 2.36 2.36 0 0 0-.73 1.75A4.1 4.1 0 0 0 8.43 13a9.34 9.34 0 0 0 3.57 3.17 12.2 12.2 0 0 0 1.2.44 2.9 2.9 0 0 0 1.32.08 2.15 2.15 0 0 0 1.41-1 1.74 1.74 0 0 0 .13-1c-.05-.08-.18-.13-.38-.23Z" />
          </svg>
        </button>
      )}
      {task.dealName && (
        <div
          className={`text-[8px] leading-snug break-words ${colors.deadline} ${
            task.phone ? "pr-4" : ""
          }`}
        >
          {task.dealName}
        </div>
      )}
      <div
        className={`text-[10px] font-medium leading-snug break-words ${colors.title} ${
          task.phone && !task.dealName ? "pr-4" : ""
        }`}
      >
        {task.title}
      </div>
    </div>
  );
}
