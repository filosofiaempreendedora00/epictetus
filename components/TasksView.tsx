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
  const [dateView, setDateView] = useState<DateView>("weekly");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingForDate, setCreatingForDate] = useState<Date | null>(null);
  const [creatingForDealId, setCreatingForDealId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TaskType | "ALL">("ALL");

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
    const res = await fetch("/api/bitrix/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fields.title,
        description: fields.description,
        dealId: fields.dealId,
        deadline: fields.deadline,
      }),
    });
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
          />
        ) : (
          <DayColumnsView
            tasksByDay={tasksByDay}
            days={dateView === "weekly" ? 7 : 14}
            onTaskClick={setEditingTaskId}
            onCreateTaskForDay={(d) => {
              setCreatingForDate(d);
              setCreatingTask(true);
            }}
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
  onTaskClick,
  onCreateTaskForDay,
}: {
  tasksByDay: Map<string, TaskCard[]>;
  days: number;
  onTaskClick: (taskId: string) => void;
  onCreateTaskForDay?: (date: Date) => void;
}) {
  const now = new Date();
  const start = startOfWeekSunday(now);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
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
          />
        ))}
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
}: {
  date: Date;
  isToday: boolean;
  tasks: TaskCard[];
  onTaskClick: (taskId: string) => void;
  onCreateTaskForDay?: (date: Date) => void;
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
        <TaskMiniCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} />
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
}: {
  tasksByDay: Map<string, TaskCard[]>;
  onTaskClick: (taskId: string) => void;
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
}: {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  tasks: TaskCard[];
  onTaskClick: (taskId: string) => void;
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
}: {
  task: TaskCard;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const colors = TASK_TYPE_COLORS[task.type];
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`w-full text-left rounded-md shadow-sm px-2 py-1.5 hover:shadow-md transition cursor-grab active:cursor-grabbing border ${colors.bg} ${colors.border} ${colors.hover}`}
      title={`${task.title} — clique para editar, arraste para mudar o dia`}
    >
      {task.dealName && (
        <div className={`text-[9px] leading-snug break-words ${colors.deadline}`}>
          {task.dealName}
        </div>
      )}
      <div className={`text-[11px] font-medium leading-snug break-words ${colors.title}`}>
        {task.title}
      </div>
    </button>
  );
}

function MonthlyTaskItem({
  task,
  onClick,
}: {
  task: TaskCard;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const colors = TASK_TYPE_COLORS[task.type];
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className={`block w-full text-left transition rounded px-1.5 py-1 leading-snug break-words cursor-grab active:cursor-grabbing border ${colors.bg} ${colors.border} ${colors.hover}`}
      title={
        task.dealName
          ? `${task.dealName} — ${task.title} — clique para editar, arraste para mudar o dia`
          : `${task.title} — clique para editar, arraste para mudar o dia`
      }
    >
      {task.dealName && (
        <div className={`text-[8px] leading-snug break-words ${colors.deadline}`}>
          {task.dealName}
        </div>
      )}
      <div className={`text-[10px] font-medium leading-snug break-words ${colors.title}`}>
        {task.title}
      </div>
    </button>
  );
}
