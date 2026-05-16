import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";
import type { DealTask } from "@/lib/types";

export const dynamic = "force-dynamic";

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
