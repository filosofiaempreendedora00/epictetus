import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";
const FIELD_MOTIVO_PERDA = "UF_CRM_1771965137";
const FIELD_DESCRICAO_PERDA = "UF_CRM_1753447633";
const FIELD_SERVICOS_MAPEADOS = "UF_CRM_1772734873";

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
    if (Array.isArray(body.motivoIds)) {
      fields[FIELD_MOTIVO_PERDA] = body.motivoIds.map((x: any) => String(x));
    }
    if (typeof body.descricao === "string") {
      fields[FIELD_DESCRICAO_PERDA] = body.descricao;
    }
    if (Array.isArray(body.servicoIds)) {
      fields[FIELD_SERVICOS_MAPEADOS] = body.servicoIds.map((x: any) => String(x));
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "Nada para atualizar" },
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
