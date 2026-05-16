import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const stageId: string | undefined = body?.stageId;
    if (!stageId) {
      return NextResponse.json({ error: "stageId é obrigatório" }, { status: 400 });
    }

    await bitrix("crm.deal.update", {
      id: params.id,
      fields: { STAGE_ID: stageId },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao atualizar etapa" },
      { status: 500 }
    );
  }
}
