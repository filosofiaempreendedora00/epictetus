import { NextResponse } from "next/server";
import { bitrix, bitrixListAll } from "@/lib/bitrix";
import type { BoardState, Card, Column, EnumOption } from "@/lib/types";

export const dynamic = "force-dynamic";

// Pipeline de Congelados: pega tudo o que está em STAGE_ID=LOSE do Roberto
// e organiza em colunas por TEMPO DESDE QUE FOI CONGELADO (CLOSEDATE).
// Buckets: ≤7 dias, ≤15 dias, ≤30 dias, ≤60 dias, mais de 60 dias.
// Os motivos do deal ficam disponíveis nos cards (pra ver no modal).
// V1 read-only — devolvemos no mesmo formato BoardState do /api/bitrix/board
// pra que a UI possa reusar Card + Column.

const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";
const FIELD_MOTIVO_PERDA = "UF_CRM_1771965137";
const FIELD_DESCRICAO_PERDA = "UF_CRM_1753447633";
const FIELD_SERVICOS_MAPEADOS = "UF_CRM_1772734873";
const FIELD_PROPOSAL_LINK = "UF_CRM_1758580725895";

// Buckets de tempo (ordem da esquerda pra direita = mais recente → mais antigo).
// `maxDays` é INCLUSIVO: vão pra essa coluna todos os deals cujo CLOSEDATE
// está há ≤ maxDays. O último bucket usa Infinity pra capturar o resto.
// Cores em gradiente de "quente" (recente, ainda dá pra recuperar) pra
// "frio" (antigo, provavelmente perdido).
// Títulos descrevem o range REAL (faixa de dias), não só o teto. Antes
// estava "Há 60 dias" — confundia, parecia que todo deal da coluna tinha
// exatamente 60 dias quando na verdade era 31 a 60.
const TIME_BUCKETS = [
  { id: "le-7", title: "Há até 7 dias", maxDays: 7, color: "from-rose-500 to-orange-500" },
  { id: "le-15", title: "Há 8 a 15 dias", maxDays: 15, color: "from-orange-500 to-amber-500" },
  { id: "le-30", title: "Há 16 a 30 dias", maxDays: 30, color: "from-amber-500 to-yellow-500" },
  { id: "le-60", title: "Há 31 a 60 dias", maxDays: 60, color: "from-sky-500 to-cyan-500" },
  { id: "older", title: "Há mais de 60 dias", maxDays: Infinity, color: "from-slate-500 to-slate-600" },
] as const;

function bucketIdFor(daysAgo: number): string {
  for (const b of TIME_BUCKETS) {
    if (daysAgo <= b.maxDays) return b.id;
  }
  return "older";
}

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

// Para congelados a data mais útil é "há quantos dias foi congelado"
// (não o dia exato). Formata como "hoje", "ontem", "há 3 dias", etc.
function daysAgoFromDate(d: Date, now: Date = new Date()): number {
  const ms = now.getTime() - d.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function relativeDateLabel(iso: string | undefined): string {
  if (!iso) return "data desconhecida";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "data desconhecida";
  const days = daysAgoFromDate(d);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  if (days < 60) return `há ~${Math.round(days / 7)} semanas`;
  if (days < 365) return `há ~${Math.round(days / 30)} meses`;
  return `há ~${Math.round(days / 365)} anos`;
}

// Data exata pro chip "gelinho" — formato BR curto (dd/mm/aaaa).
function dateBRShort(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return undefined;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

async function fetchEnumOptions(fieldName: string): Promise<EnumOption[]> {
  const fields = await bitrix<any[]>("crm.deal.userfield.list", {
    filter: { FIELD_NAME: fieldName },
  });
  const field = fields?.[0];
  const list = field?.LIST || [];
  return list.map((item: any) => ({ id: String(item.ID), value: String(item.VALUE) }));
}

export async function GET() {
  try {
    const responsibleId = process.env.BITRIX_RESPONSIBLE_USER_ID;
    if (!responsibleId) {
      return NextResponse.json(
        { error: "BITRIX_RESPONSIBLE_USER_ID não configurado" },
        { status: 500 }
      );
    }

    const [dealsRaw, sourcesRaw, usersRaw, motivoOptions] = await Promise.all([
      bitrixListAll<RawDeal>("crm.deal.list", {
        // Só congelados do Roberto (mesmo critério das outras views).
        filter: { STAGE_ID: "LOSE", ASSIGNED_BY_ID: responsibleId },
        select: [
          "ID", "TITLE", "OPPORTUNITY", "ASSIGNED_BY_ID",
          "DATE_MODIFY", "CLOSEDATE",
          "SOURCE_ID", "CONTACT_ID",
          FIELD_VALOR_PONTUAL, FIELD_VALOR_RECORRENTE,
          FIELD_MOTIVO_PERDA, FIELD_DESCRICAO_PERDA, FIELD_SERVICOS_MAPEADOS,
          FIELD_PROPOSAL_LINK,
        ],
        // Mais recentes primeiro (data do congelamento ⇒ CLOSEDATE).
        order: { CLOSEDATE: "DESC" },
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

    // Cria as 5 colunas de bucket de tempo (ordem fixa, do mais recente
    // pro mais antigo). Sempre todas presentes mesmo que vazias —
    // mantém a estrutura visual estável.
    const columns: Column[] = TIME_BUCKETS.map((b) => ({
      id: `col-bucket-${b.id}`,
      title: b.title,
      color: b.color,
      cardIds: [],
      // stageId undefined → UI não habilita drag-and-drop nem dropdown
      // de fase (essas colunas não são fases reais do Bitrix).
      stageId: undefined,
    }));
    const colByBucketId = new Map<string, Column>(
      columns.map((c) => [c.id.replace("col-bucket-", ""), c])
    );

    const now = new Date();

    const cards: Record<string, Card> = {};
    for (const d of dealsRaw) {
      const id = `card-${d.ID}`;
      // Motivo (pra mostrar no card / modal). Array enum-multi.
      const motivoRaw = d[FIELD_MOTIVO_PERDA];
      const motivoIds = Array.isArray(motivoRaw)
        ? motivoRaw.map(String)
        : motivoRaw
        ? [String(motivoRaw)]
        : [];
      const motivoLabels = motivoIds
        .map((mid) => motivoLabelById.get(mid))
        .filter(Boolean) as string[];

      // CLOSEDATE = quando virou LOSE; fallback DATE_MODIFY se ausente.
      const closeIso = d.CLOSEDATE || d.DATE_MODIFY;
      const closeDate = closeIso ? new Date(closeIso) : null;
      const validDate = closeDate && !isNaN(closeDate.getTime());
      const daysAgo = validDate ? daysAgoFromDate(closeDate!, now) : Infinity;
      const bucketId = bucketIdFor(daysAgo);

      const card: Card = {
        id,
        bitrixId: d.ID,
        title: d.TITLE || "(sem título)",
        value: parseFloat(d.OPPORTUNITY || "0") || 0,
        // No pipeline de congelados o dateLabel reflete o tempo desde
        // o congelamento (não a data exata) — informação mais útil pra
        // priorizar follow-up.
        dateLabel: relativeDateLabel(closeIso),
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
        // Campos extras só pro pipeline de congelados (UI consome opc.).
        congeladoMotivos: motivoLabels,
        congeladoDescricao:
          typeof d[FIELD_DESCRICAO_PERDA] === "string"
            ? String(d[FIELD_DESCRICAO_PERDA]).trim() || undefined
            : undefined,
        congeladoEm: dateBRShort(closeIso),
      } as Card;
      cards[id] = card;
      const col = colByBucketId.get(bucketId);
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
