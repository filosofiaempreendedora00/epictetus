"use client";

import { useEffect, useState } from "react";
import type { TasksBoardState, TaskCard, TaskColumn } from "@/lib/types";

const EMPTY: TasksBoardState = { columns: [], tasks: {} };

const PT_MONTH = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (sameDay) return `hoje, ${hh}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const ddmm = `${d.getDate()} de ${PT_MONTH[d.getMonth()]}`;
  return sameYear ? `${ddmm}, ${hh}` : `${ddmm} de ${d.getFullYear()}, ${hh}`;
}

export default function TasksView({ searchTerm }: { searchTerm: string }) {
  const [state, setState] = useState<TasksBoardState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/bitrix/tasks", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Erro ao carregar tarefas");
        } else {
          setState(data as TasksBoardState);
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

  function filterIds(ids: string[]): string[] {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return ids;
    return ids.filter((id) => {
      const t = state.tasks[id];
      if (!t) return false;
      return (
        t.title.toLowerCase().includes(q) ||
        t.dealName?.toLowerCase().includes(q) ||
        false
      );
    });
  }

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
    <div className="flex gap-4 overflow-x-auto px-6 pb-6 col-scroll">
      {state.columns.map((col) => {
        const ids = filterIds(col.taskIds);
        const tasks = ids.map((id) => state.tasks[id]).filter(Boolean);
        return <ColumnView key={col.id} column={col} tasks={tasks} />;
      })}
    </div>
  );
}

function ColumnView({ column, tasks }: { column: TaskColumn; tasks: TaskCard[] }) {
  return (
    <div className="flex flex-col w-[260px] shrink-0">
      <div
        className={`bg-gradient-to-r ${column.color} rounded-t-2xl px-4 py-3 flex items-center justify-between shadow-md`}
      >
        <div className="flex items-center gap-2 text-white font-medium text-sm">
          <span>{column.title}</span>
          <span className="text-white/85">{tasks.length}</span>
        </div>
      </div>

      <div
        className="flex-1 px-2 py-2 space-y-2 col-scroll overflow-y-auto min-h-[200px] border-x border-white/5"
        style={{ maxHeight: "calc(100vh - 240px)" }}
      >
        {tasks.length === 0 && (
          <div className="text-center text-white/30 text-[11px] py-6">
            Nenhuma tarefa
          </div>
        )}
        {tasks.map((task) => (
          <TaskCardView key={task.id} task={task} bucketId={column.id} />
        ))}
      </div>

      <div className="bg-white/[0.02] border-x border-b border-white/5 rounded-b-2xl h-3" />
    </div>
  );
}

function TaskCardView({
  task,
  bucketId,
}: {
  task: TaskCard;
  bucketId: string;
}) {
  const overdue = bucketId === "overdue";
  const isToday = bucketId === "today";

  return (
    <div className="bg-white rounded-xl shadow-sm px-3 py-2.5">
      <h3 className="text-slate-900 font-medium text-[13px] leading-snug break-words">
        {task.title}
      </h3>

      {task.dealName ? (
        <>
          <div className="mt-2 text-[9px] text-slate-500">Negócio</div>
          <div className="text-sky-600 text-[12px] leading-snug break-words">
            {task.dealName}
          </div>
        </>
      ) : (
        <div className="mt-2 text-[10px] text-slate-400">Sem negócio vinculado</div>
      )}

      {task.deadline ? (
        <div
          className={`mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] ${
            overdue
              ? "bg-red-50 border-red-100 text-red-700"
              : isToday
              ? "bg-lime-50 border-lime-100 text-lime-700"
              : "bg-sky-50 border-sky-100 text-sky-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              overdue ? "bg-red-500" : isToday ? "bg-lime-500" : "bg-sky-500"
            }`}
          />
          <span className="whitespace-nowrap">{formatDeadline(task.deadline)}</span>
        </div>
      ) : (
        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-[10px]">
          Sem prazo
        </div>
      )}
    </div>
  );
}
