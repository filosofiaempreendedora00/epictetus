import { NextResponse } from "next/server";
import { bitrix, bitrixListAll } from "@/lib/bitrix";
import type { DealTask, TaskCard, TasksBoardState } from "@/lib/types";
import { inferTaskType } from "@/lib/taskTypes";

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
    const dealPhoneMap = new Map<string, string>();
    if (dealIds.size > 0) {
      const deals = await bitrix<any[]>("crm.deal.list", {
        filter: { ID: Array.from(dealIds) },
        select: ["ID", "TITLE", "CONTACT_ID"],
      });
      const dealToContact = new Map<string, string>();
      const contactIdSet = new Set<string>();
      for (const d of deals) {
        dealMap.set(d.ID, d.TITLE);
        if (d.CONTACT_ID && d.CONTACT_ID !== "0") {
          dealToContact.set(String(d.ID), String(d.CONTACT_ID));
          contactIdSet.add(String(d.CONTACT_ID));
        }
      }
      if (contactIdSet.size > 0) {
        const contactPhone = new Map<string, string>();
        const idsArr = Array.from(contactIdSet);
        for (let i = 0; i < idsArr.length; i += 50) {
          const chunk = idsArr.slice(i, i + 50);
          const contacts = await bitrix<any[]>("crm.contact.list", {
            filter: { ID: chunk },
            select: ["ID", "PHONE"],
          });
          for (const c of contacts || []) {
            const phones = (c.PHONE || []) as Array<{
              VALUE?: string;
              VALUE_TYPE?: string;
            }>;
            if (!phones.length) continue;
            const mobile = phones.find((p) => p.VALUE_TYPE === "MOBILE");
            const phone = (mobile || phones[0])?.VALUE;
            if (phone) contactPhone.set(String(c.ID), phone);
          }
        }
        for (const [did, cid] of dealToContact) {
          const phone = contactPhone.get(cid);
          if (phone) dealPhoneMap.set(did, phone);
        }
      }
    }

    const tasksMap: Record<string, TaskCard> = {};
    for (const t of tasksRaw) {
      const id = `task-${t.id}`;
      const dealLinks = (t.ufCrmTask || []).filter((l) => l.startsWith("D_"));
      const dealId = dealLinks[0]?.slice(2);
      tasksMap[id] = {
        id,
        bitrixId: String(t.id),
        title: t.title,
        description: t.description || "",
        deadline: t.deadline || null,
        dealId,
        dealName: dealId ? dealMap.get(dealId) : undefined,
        phone: dealId ? dealPhoneMap.get(dealId) : undefined,
        type: inferTaskType(t.title),
      };
    }

    // Lista de negócios do Roberto (Pipeline Commerce) pra dropdown de criação
    const robertoDeals = await bitrixListAll<{ ID: string; TITLE: string }>(
      "crm.deal.list",
      {
        filter: { CATEGORY_ID: 0, ASSIGNED_BY_ID: responsibleId },
        select: ["ID", "TITLE"],
        order: { TITLE: "ASC" },
      }
    );
    const dealsForSelect = robertoDeals.map((d) => ({
      id: d.ID,
      name: d.TITLE || `Negócio ${d.ID}`,
    }));

    const state: TasksBoardState = { tasks: tasksMap, deals: dealsForSelect };
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
    const deadline: string | null = body.deadline || null;

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

    const taskFields: Record<string, any> = {
      TITLE: title,
      DESCRIPTION: description,
      RESPONSIBLE_ID: responsibleId,
      CREATED_BY: responsibleId,
      UF_CRM_TASK: [`D_${dealId}`],
    };
    if (deadline) taskFields.DEADLINE = deadline;

    const result = await bitrix<{ task: any }>("tasks.task.add", {
      fields: taskFields,
    });

    const t = result?.task || {};
    const finalDeadline = t.deadline ?? deadline ?? null;
    const finalTitle = t.title ?? title;
    const newTask: DealTask = {
      id: String(t.id ?? ""),
      title: finalTitle,
      description: t.description ?? description,
      deadline: finalDeadline,
      overdue: finalDeadline ? new Date(finalDeadline).getTime() < Date.now() : false,
      type: inferTaskType(finalTitle),
    };

    return NextResponse.json(newTask);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao criar tarefa" },
      { status: 500 }
    );
  }
}
