import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const fields: Record<string, any> = {};

    if (typeof body.title === "string") fields.TITLE = body.title.trim();
    if (typeof body.description === "string") fields.DESCRIPTION = body.description;

    if (!fields.TITLE && fields.DESCRIPTION === undefined) {
      return NextResponse.json(
        { error: "Passe title ou description" },
        { status: 400 }
      );
    }
    if (fields.TITLE === "") {
      return NextResponse.json(
        { error: "O nome da tarefa não pode ficar vazio" },
        { status: 400 }
      );
    }

    await bitrix("tasks.task.update", {
      taskId: params.id,
      fields,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao atualizar tarefa" },
      { status: 500 }
    );
  }
}
