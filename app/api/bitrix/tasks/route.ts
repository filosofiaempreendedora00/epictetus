import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";
import type { DealTask, TaskCard, TaskColumn, TasksBoardState } from "@/lib/types";

export const dynamic = "force-dynamic";

type RawTaskItem = {
  id: string | number;
  title: string;
  description?: string;
  deadline: string | null;
  status: string | number;
  ufCrmTask?: string[];
};

async function fetchRobertoOpenTasks(responsibleId: string): Promise<RawTaskItem[]> {
  const out: RawTaskItem[] = [];
  let start = 0;
  for (let i = 0; i < 50; i++) {
    const resp = await bitrix<{ tasks: RawTaskItem[] } | RawTaskItem[]>(
      "tasks.task.list",
      {
        filter: { "<STATUS": 5, RESPONSIBLE_ID: responsibleId },
        select: ["ID", "TITLE", "DESCRIPTION", "DEADLINE", "STATUS", "UF_CRM_TASK"],
        order: { DEADLINE: "asc" },
        start,
      }
    );
    const chunk = Array.isArray(resp) ? resp : resp.tasks || [];
    out.push(...chunk);
    if (chunk.length < 50) break;
    start += 50;
  }
  return out;
}

export async function GET() {
  try {
    const responsibleId = process.env.BITRIX_RESPONSIBLE_USER_ID;
    if (!responsibleId) {
      return NextResponse.json(
        { error: "BITRIX_RESPONSIBLE_USER_ID não configurado em .env.local" },
        { status: 500 }
      );
    }

    const tasksRaw = await fetchRobertoOpenTasks(responsibleId);

    const dealIds = new Set<string>();
    for (const t of tasksRaw) {
      for (const link of t.ufCrmTask || []) {
        if (link.startsWith("D_")) dealIds.add(link.slice(2));
      }
    }

    const dealMap = new Map<string, string>();
    if (dealIds.size > 0) {
      const deals = await bitrix<any[]>("crm.deal.list", {
        filter: { ID: Array.from(dealIds) },
        select: ["ID", "TITLE"],
      });
      for (const d of deals) dealMap.set(d.ID, d.TITLE);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfToday.getDate() + 1);
    const day = startOfToday.getDay();
    const daysToMonday = ((8 - day) % 7) || 7;
    const startOfNextMonday = new Date(startOfToday);
    startOfNextMonday.setDate(startOfToday.getDate() + daysToMonday);
    const startOfWeekAfterNext = new Date(startOfNextMonday);
    startOfWeekAfterNext.setDate(startOfNextMonday.getDate() + 7);

    const overdue: TaskColumn = {
      id: "overdue",
      title: "Vencido",
      color: "from-red-500 to-red-600",
      taskIds: [],
    };
    const today: TaskColumn = {
      id: "today",
      title: "Vencimento hoje",
      color: "from-lime-500 to-lime-600",
      taskIds: [],
    };
    const thisWeek: TaskColumn = {
      id: "this_week",
      title: "Vencimento esta semana",
      color: "from-sky-400 to-sky-500",
      taskIds: [],
    };
    const nextWeek: TaskColumn = {
      id: "next_week",
      title: "Vencimento na próxima semana",
      color: "from-cyan-400 to-teal-400",
      taskIds: [],
    };
    const noDeadline: TaskColumn = {
      id: "no_deadline",
      title: "Sem prazo",
      color: "from-slate-500 to-slate-600",
      taskIds: [],
    };

    const tasksMap: Record<string, TaskCard> = {};
    for (const t of tasksRaw) {
      const id = `task-${t.id}`;
      const dealLinks = (t.ufCrmTask || []).filter((l) => l.startsWith("D_"));
      const dealId = dealLinks[0]?.slice(2);
      const card: TaskCard = {
        id,
        bitrixId: String(t.id),
        title: t.title,
        description: t.description || "",
        deadline: t.deadline || null,
        dealId,
        dealName: dealId ? dealMap.get(dealId) : undefined,
      };
      tasksMap[id] = card;

      if (!t.deadline) {
        noDeadline.taskIds.push(id);
        continue;
      }
      const dl = new Date(t.deadline);
      if (isNaN(dl.getTime())) {
        noDeadline.taskIds.push(id);
      } else if (dl < startOfToday) {
        overdue.taskIds.push(id);
      } else if (dl < startOfTomorrow) {
        today.taskIds.push(id);
      } else if (dl < startOfNextMonday) {
        thisWeek.taskIds.push(id);
      } else if (dl < startOfWeekAfterNext) {
        nextWeek.taskIds.push(id);
      }
      // tarefas além da próxima semana: ficam fora da visão por enquanto
    }

    const state: TasksBoardState = {
      columns: [overdue, today, thisWeek, nextWeek, noDeadline],
      tasks: tasksMap,
    };
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao buscar tarefas" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title: string = (body.title || "").trim();
    const description: string = body.description || "";
    const dealId: string = String(body.dealId || "").trim();

    if (!title) {
      return NextResponse.json(
        { error: "O nome da tarefa é obrigatório" },
        { status: 400 }
      );
    }
    if (!dealId) {
      return NextResponse.json(
        { error: "dealId é obrigatório" },
        { status: 400 }
      );
    }

    const responsibleId = process.env.BITRIX_RESPONSIBLE_USER_ID;
    if (!responsibleId) {
      return NextResponse.json(
        { error: "BITRIX_RESPONSIBLE_USER_ID não configurado em .env.local" },
        { status: 500 }
      );
    }

    const result = await bitrix<{ task: any }>("tasks.task.add", {
      fields: {
        TITLE: title,
        DESCRIPTION: description,
        RESPONSIBLE_ID: responsibleId,
        CREATED_BY: responsibleId,
        UF_CRM_TASK: [`D_${dealId}`],
      },
    });

    const t = result?.task || {};
    const newTask: DealTask = {
      id: String(t.id ?? ""),
      title: t.title ?? title,
      description: t.description ?? description,
      deadline: t.deadline ?? null,
      overdue: false,
    };

    return NextResponse.json(newTask);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao criar tarefa" },
      { status: 500 }
    );
  }
}
