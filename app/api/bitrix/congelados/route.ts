import { NextResponse } from "next/server";
import { bitrix, bitrixListAll } from "@/lib/bitrix";
import type { BoardState, Card, Column, EnumOption } from "@/lib/types";

export const dynamic = "force-dynamic";

// Pipeline de Congelados: pega tudo o que está em STAGE_ID=LOSE no Bitrix
// e organiza em colunas por MOTIVO DE PERDA (primeiro motivo do array).
// V1 é só leitura — devolvemos no mesmo formato BoardState do /api/bitrix/board
// pra que a UI possa reusar Card + Column.

const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";
const FIELD_MOTIVO_PERDA = "UF_CRM_1771965137";
const FIELD_DESCRICAO_PERDA = "UF_CRM_1753447633";
const FIELD_SERVICOS_MAPEADOS = "UF_CRM_1772734873";
const FIELD_PROPOSAL_LINK = "UF_CRM_1758580725895";

// Cores pra cada coluna (uma paleta variada pra diferenciar visualmente
// os motivos — ciclamos pelo array conforme a ordem que vier do Bitrix).
const COLUMN_COLORS = [
  "from-rose-500 to-red-500",
  "from-orange-500 to-amber-500",
  "from-amber-500 to-yellow-500",
  "from-lime-500 to-green-500",
  "from-emerald-500 to-teal-500",
  "from-cyan-500 to-sky-500",
  "from-sky-500 to-blue-500",
  "from-indigo-500 to-violet-500",
  "from-violet-500 to-purple-500",
  "from-purple-500 to-fuchsia-500",
  "from-pink-500 to-rose-500",
  "from-slate-500 to-slate-600",
  "from-zinc-500 to-zinc-600",
];

type RawDeal = {
  ID: string;
  TITLE?: string;
  OPPORTUNITY?: string;
  ASSIGNED_BY_ID?: string;
  DATE_MODIFY?: string;
  CONTACT_ID?: string;
  SOURCE_ID?: string;
  [key: string]: any;
};

type BitrixUser = { ID: string; NAME?: string; LAST_NAME?: string };

function parseMoneyField(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const str = String(raw);
  const pipeIdx = str.indexOf("|");
  const numStr = pipeIdx >= 0 ? str.slice(0, pipeIdx) : str;
  const n = parseFloat(numStr);
  return isNaN(n) ? 0 : n;
}

const PT_MONTH = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dateLabel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `hoje, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getDate()} de ${PT_MONTH[d.getMonth()]}`;
}

async function fetchEnumOptions(fieldName: string): Promise<EnumOption[]> {
  const fields = await bitrix<any[]>("crm.deal.userfield.list", {
    filter: { FIELD_NAME: fieldName },
  });
  const field = fields?.[0];
  const list = field?.LIST || [];
  return list.map((item: any) => ({ id: String(item.ID), value: String(item.VALUE) }));
}

const NO_MOTIVO_KEY = "_sem_motivo";

export async function GET() {
  try {
    const [dealsRaw, sourcesRaw, usersRaw, motivoOptions] = await Promise.all([
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: { STAGE_ID: "LOSE" },
        select: [
          "ID", "TITLE", "OPPORTUNITY", "ASSIGNED_BY_ID", "DATE_MODIFY",
          "SOURCE_ID", "CONTACT_ID",
          FIELD_VALOR_PONTUAL, FIELD_VALOR_RECORRENTE,
          FIELD_MOTIVO_PERDA, FIELD_DESCRICAO_PERDA, FIELD_SERVICOS_MAPEADOS,
          FIELD_PROPOSAL_LINK,
        ],
        order: { DATE_MODIFY: "DESC" },
      }),
      bitrix<{ STATUS_ID: string; NAME: string }[]>("crm.status.list", {
        filter: { ENTITY_ID: "SOURCE" },
      }),
      bitrix<BitrixUser[]>("user.get", { ACTIVE: true }),
      fetchEnumOptions(FIELD_MOTIVO_PERDA),
    ]);

    const sourceMap = new Map<string, string>();
    (sourcesRaw || []).forEach((s) => sourceMap.set(s.STATUS_ID, s.NAME));

    const userMap = new Map<string, string>();
    (usersRaw || []).forEach((u) => {
      const full = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim();
      userMap.set(u.ID, full || `Usuário ${u.ID}`);
    });

    const motivoLabelById = new Map<string, string>();
    motivoOptions.forEach((m) => motivoLabelById.set(m.id, m.value));

    // Cria colunas — ordem: a do Bitrix + uma "Sem motivo" no final.
    const columns: Column[] = motivoOptions.map((m, i) => ({
      id: `col-motivo-${m.id}`,
      title: m.value,
      color: COLUMN_COLORS[i % COLUMN_COLORS.length],
      cardIds: [],
      // stageId aqui não corresponde ao Bitrix STAGE — é o ID do motivo.
      // Sinalizamos como undefined pra desativar drag-and-drop (a UI
      // existente exige stageId pra mover).
      stageId: undefined,
    }));
    columns.push({
      id: `col-motivo-${NO_MOTIVO_KEY}`,
      title: "Sem motivo",
      color: "from-slate-600 to-slate-700",
      cardIds: [],
      stageId: undefined,
    });

    const colByMotivoId = new Map<string, Column>();
    columns.forEach((c) => {
      // Recupera o motivo id a partir do col.id
      const mid = c.id.replace("col-motivo-", "");
      colByMotivoId.set(mid, c);
    });

    const cards: Record<string, Card> = {};
    for (const d of dealsRaw) {
      const id = `card-${d.ID}`;
      // Motivo array vem como ["1738","1712"] ou similar
      const motivoRaw = d[FIELD_MOTIVO_PERDA];
      const motivoIds = Array.isArray(motivoRaw)
        ? motivoRaw.map(String)
        : motivoRaw
        ? [String(motivoRaw)]
        : [];
      const primaryMotivo = motivoIds[0] || NO_MOTIVO_KEY;
      const motivoLabels = motivoIds
        .map((mid) => motivoLabelById.get(mid))
        .filter(Boolean) as string[];

      const card: Card = {
        id,
        bitrixId: d.ID,
        title: d.TITLE || "(sem título)",
        value: parseFloat(d.OPPORTUNITY || "0") || 0,
        dateLabel: dateLabel(d.DATE_MODIFY),
        responsible:
          userMap.get(d.ASSIGNED_BY_ID || "") ||
          `Usuário ${d.ASSIGNED_BY_ID}`,
        source: sourceMap.get(d.SOURCE_ID || "") || d.SOURCE_ID || "—",
        pontual: parseMoneyField(d[FIELD_VALOR_PONTUAL]),
        recurring: parseMoneyField(d[FIELD_VALOR_RECORRENTE]),
        tasks: [],
        proposalLink:
          typeof d[FIELD_PROPOSAL_LINK] === "string"
            ? String(d[FIELD_PROPOSAL_LINK]).trim() || undefined
            : undefined,
        // Campos extras só pro pipeline de congelados (a UI consome opcionalmente).
        congeladoMotivos: motivoLabels,
        congeladoDescricao:
          typeof d[FIELD_DESCRICAO_PERDA] === "string"
            ? String(d[FIELD_DESCRICAO_PERDA]).trim() || undefined
            : undefined,
      } as Card;
      cards[id] = card;
      const col = colByMotivoId.get(primaryMotivo);
      if (col) col.cardIds.push(id);
    }

    const board: BoardState = { columns, cards };
    return NextResponse.json(board);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao carregar congelados" },
      { status: 500 }
    );
  }
}
