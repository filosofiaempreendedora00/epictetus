import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const fields: Record<string, any> = {};

    if (typeof body.stageId === "string" && body.stageId) {
      fields.STAGE_ID = body.stageId;
    }
    if (typeof body.pontual === "number" && body.pontual >= 0) {
      fields[FIELD_VALOR_PONTUAL] = `${body.pontual}|BRL`;
    }
    if (typeof body.recurring === "number" && body.recurring >= 0) {
      fields[FIELD_VALOR_RECORRENTE] = `${body.recurring}|BRL`;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "Nada para atualizar (passe stageId, pontual ou recurring)" },
        { status: 400 }
      );
    }

    await bitrix("crm.deal.update", { id: params.id, fields });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao atualizar negócio" },
      { status: 500 }
    );
  }
}
