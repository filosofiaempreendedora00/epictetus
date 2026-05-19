import { NextResponse } from "next/server";
import { bitrix } from "@/lib/bitrix";
import { REUNIAO_FIELDS } from "@/lib/reuniaoFields";

export const dynamic = "force-dynamic";

const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";
const FIELD_MOTIVO_PERDA = "UF_CRM_1771965137";
const FIELD_DESCRICAO_PERDA = "UF_CRM_1753447633";
const FIELD_SERVICOS_MAPEADOS = "UF_CRM_1772734873";
const FIELD_PROPOSAL_LINK = "UF_CRM_1758580725895";

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
    if (typeof body.proposalLink === "string") {
      fields[FIELD_PROPOSAL_LINK] = body.proposalLink.trim();
    }

    // Campos da Reunião realizada (15 campos obrigatórios pra avançar de etapa)
    if (body.reuniaoData && typeof body.reuniaoData === "object") {
      for (const f of REUNIAO_FIELDS) {
        const value = body.reuniaoData[f.key];
        if (value === undefined || value === null) continue;
        if (f.type === "enum-multi") {
          if (Array.isArray(value)) {
            fields[f.bitrixField] = value.map((x: any) => String(x));
          }
        } else if (f.type === "datetime") {
          if (typeof value === "string" && value) {
            fields[f.bitrixField] = value;
          }
        } else {
          if (typeof value === "string") {
            fields[f.bitrixField] = value;
          } else {
            fields[f.bitrixField] = String(value);
          }
        }
      }
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
