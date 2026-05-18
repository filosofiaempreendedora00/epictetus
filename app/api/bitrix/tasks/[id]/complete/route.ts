import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    if (!params.id) {
      return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
    }
    await bitrix("tasks.task.complete", { taskId: params.id });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao concluir tarefa" },
      { status: 500 }
    );
  }
}
