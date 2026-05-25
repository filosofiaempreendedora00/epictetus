import { NextResponse } from "next/server";
import { bitrix, bitrixListAll } from "@/lib/bitrix";
import type { BoardState, Card, Column, DealTask, EnumOption } from "@/lib/types";
import { REUNIAO_FIELDS } from "@/lib/reuniaoFields";
import { inferTaskType } from "@/lib/taskTypes";

export const dynamic = "force-dynamic";

const STAGE_COLORS: string[] = [
  "from-[#2c7cb0] to-[#3a8cc0]",
  "from-[#3aacd9] to-[#46bfe0]",
  "from-[#4dd0ce] to-[#55dcc8]",
  "from-[#5fe0b7] to-[#6ce8a5]",
  "from-[#ffb84d] to-[#ffa900]",
  "from-[#ace9fb] to-[#9fdcef]",
  "from-[#c9b8ff] to-[#a98bff]",
  "from-[#ffd1a1] to-[#ffb273]",
  "from-[#7bd500] to-[#5fb000]",
  "from-[#f39c5a] to-[#f36509]",
  "from-[#f56565] to-[#f11716]",
  "from-[#a3201e] to-[#9e0502]",
];

type Stage = {
  STATUS_ID: string;
  NAME: string;
  SORT: string;
  SEMANTICS: string | null;
};

// Etapas visíveis no Kanban: em andamento (SEMANTICS=null) + Congelados (LOSE)
// + Negócio perdido (APOLOGY). Exclui: Ganho (WON), Descartado (UC_QCL40Q).
const EXTRA_VISIBLE_STAGES = new Set(["LOSE", "APOLOGY"]);
function isStageVisible(s: Stage): boolean {
  if (s.SEMANTICS === null || s.SEMANTICS === "") return true;
  return EXTRA_VISIBLE_STAGES.has(s.STATUS_ID);
}

// Cores forçadas para etapas específicas (sobrescreve a paleta padrão).
const STAGE_COLOR_BY_ID: Record<string, string> = {
  UC_YN6AV9: "from-[#94a3b8] to-[#64748b]", // Aguardado os dados - cinza-azulado
  LOSE: "from-[#ace9fb] to-[#9fdcef]",      // Congelados - azul-claro (frio)
  APOLOGY: "from-[#ef4444] to-[#dc2626]",   // Negócio perdido - vermelho
};

type Deal = {
  ID: string;
  TITLE: string;
  STAGE_ID: string;
  OPPORTUNITY: string;
  ASSIGNED_BY_ID: string;
  SOURCE_ID: string;
  DATE_MODIFY: string;
  CONTACT_ID?: string;
  [key: string]: any;
};

type RawPhoneEntry = { VALUE?: string; VALUE_TYPE?: string };
type RawContact = { ID: string; PHONE?: RawPhoneEntry[] };

async function fetchPhoneMap(contactIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < contactIds.length; i += 50) {
    const chunk = contactIds.slice(i, i + 50);
    const contacts = await bitrix<RawContact[]>("crm.contact.list", {
      filter: { ID: chunk },
      select: ["ID", "PHONE"],
    });
    for (const c of contacts || []) {
      const phones = c.PHONE || [];
      if (!phones.length) continue;
      const mobile = phones.find((p) => p.VALUE_TYPE === "MOBILE");
      const phone = (mobile || phones[0])?.VALUE;
      if (phone) map.set(String(c.ID), phone);
    }
  }
  return map;
}

// Campos personalizados do Bitrix (Pipeline Commerce — turbopartners)
const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";
const FIELD_MOTIVO_PERDA = "UF_CRM_1771965137";
const FIELD_SERVICOS_MAPEADOS = "UF_CRM_1772734873";
// Campo URL genérico que vamos usar pra "Link da proposta".
// Se preferir criar um dedicado no Bitrix, basta trocar esse ID.
const FIELD_PROPOSAL_LINK = "UF_CRM_1758580725895";

async function fetchEnumOptions(fieldName: string): Promise<EnumOption[]> {
  const fields = await bitrix<any[]>("crm.deal.userfield.list", {
    filter: { FIELD_NAME: fieldName },
  });
  const field = fields?.[0];
  const list = field?.LIST || [];
  return list.map((item: any) => ({
    id: String(item.ID),
    value: String(item.VALUE),
  }));
}

function parseMoneyField(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const str = String(raw);
  const pipeIdx = str.indexOf("|");
  const numStr = pipeIdx >= 0 ? str.slice(0, pipeIdx) : str;
  const n = parseFloat(numStr);
  return isNaN(n) ? 0 : n;
}

type RawTask = {
  id: string | number;
  title: string;
  description?: string;
  deadline: string | null;
  status: string | number;
  ufCrmTask?: string[];
};

async function fetchOpenTasks(): Promise<RawTask[]> {
  const out: RawTask[] = [];
  let start = 0;
  for (let i = 0; i < 50; i++) {
    const resp = await bitrix<{ tasks: RawTask[] } | RawTask[]>(
      "tasks.task.list",
      {
        filter: { "<STATUS": 5 },
        select: ["ID", "TITLE", "DESCRIPTION", "DEADLINE", "STATUS", "UF_CRM_TASK"],
        order: { DEADLINE: "asc" },
        start,
      }
    );
    const chunk = Array.isArray(resp) ? resp : resp.tasks || [];
    out.push(...chunk);
    if (chunk.length < 50) break;
    start += 50;
    // Throttle entre páginas pra não estourar o limite do Bitrix.
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

function groupTasksByDeal(tasks: RawTask[]): Map<string, DealTask[]> {
  const map = new Map<string, DealTask[]>();
  const now = Date.now();
  for (const t of tasks) {
    const links = t.ufCrmTask || [];
    for (const link of links) {
      if (!link.startsWith("D_")) continue;
      const dealId = link.slice(2);
      const deadlineMs = t.deadline ? new Date(t.deadline).getTime() : NaN;
      const overdue = !isNaN(deadlineMs) && deadlineMs < now;
      const task: DealTask = {
        id: String(t.id),
        title: t.title,
        description: t.description || "",
        deadline: t.deadline || null,
        overdue,
        type: inferTaskType(t.title),
      };
      if (!map.has(dealId)) map.set(dealId, []);
      map.get(dealId)!.push(task);
    }
  }
  return map;
}

type BitrixUser = {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
};

type StatusRow = {
  STATUS_ID: string;
  NAME: string;
};

const PT_MONTH = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isSameDay) {
    return `hoje, ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (isYesterday) {
    return `ontem, ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return `${d.getDate()} de ${PT_MONTH[d.getMonth()]}`;
}

export async function GET() {
  try {
    const responsibleId = process.env.BITRIX_RESPONSIBLE_USER_ID;
    if (!responsibleId) {
      return NextResponse.json(
        { error: "BITRIX_RESPONSIBLE_USER_ID não está configurado em .env.local" },
        { status: 500 }
      );
    }

    const dealFilter: Record<string, any> = {
      CATEGORY_ID: 0,
      ASSIGNED_BY_ID: responsibleId,
    };

    const [
      stagesRaw,
      dealsRaw,
      sourcesRaw,
      usersRaw,
      tasksResp,
      motivoOpts,
      servicosOpts,
    ] = await Promise.all([
      bitrix<StatusRow[]>("crm.status.list", {
        filter: { ENTITY_ID: "DEAL_STAGE" },
        order: { SORT: "ASC" },
      }) as Promise<Stage[]>,
      bitrixListAll<Deal>("crm.deal.list", {
        filter: dealFilter,
        select: [
          "ID", "TITLE", "STAGE_ID", "OPPORTUNITY",
          "ASSIGNED_BY_ID", "SOURCE_ID", "DATE_MODIFY",
          "CONTACT_ID",
          FIELD_VALOR_PONTUAL, FIELD_VALOR_RECORRENTE,
          FIELD_PROPOSAL_LINK,
        ],
        order: { DATE_MODIFY: "DESC" },
      }),
      bitrix<StatusRow[]>("crm.status.list", {
        filter: { ENTITY_ID: "SOURCE" },
      }),
      bitrix<BitrixUser[]>("user.get", { ACTIVE: true }),
      fetchOpenTasks(),
      fetchEnumOptions(FIELD_MOTIVO_PERDA),
      fetchEnumOptions(FIELD_SERVICOS_MAPEADOS),
    ]);

    const tasksByDealId = groupTasksByDeal(tasksResp);

    // Coleta contatos vinculados aos deals e busca telefones em lote
    const contactIdSet = new Set<string>();
    for (const d of dealsRaw) {
      if (d.CONTACT_ID && d.CONTACT_ID !== "0") contactIdSet.add(d.CONTACT_ID);
    }
    const phoneMap =
      contactIdSet.size > 0
        ? await fetchPhoneMap(Array.from(contactIdSet))
        : new Map<string, string>();

    const stages = stagesRaw.filter(isStageVisible);

    const sourceMap = new Map<string, string>();
    (sourcesRaw || []).forEach((s) => sourceMap.set(s.STATUS_ID, s.NAME));

    const userMap = new Map<string, string>();
    (usersRaw || []).forEach((u) => {
      const full = `${u.NAME || ""} ${u.LAST_NAME || ""}`.trim();
      userMap.set(u.ID, full || `Usuário ${u.ID}`);
    });

    const sortedStages = [...stages].sort(
      (a, b) => parseInt(a.SORT, 10) - parseInt(b.SORT, 10)
    );

    const columns: Column[] = sortedStages.map((s, i) => ({
      id: `col-${s.STATUS_ID}`,
      title: s.NAME,
      color: STAGE_COLOR_BY_ID[s.STATUS_ID] || STAGE_COLORS[i % STAGE_COLORS.length],
      cardIds: [],
      stageId: s.STATUS_ID,
    }));

    const colByStage = new Map<string, Column>();
    columns.forEach((c) => {
      if (c.stageId) colByStage.set(c.stageId, c);
    });

    const cards: Record<string, Card> = {};
    for (const d of dealsRaw) {
      const id = `card-${d.ID}`;
      const card: Card = {
        id,
        bitrixId: d.ID,
        title: d.TITLE || "(sem título)",
        value: parseFloat(d.OPPORTUNITY) || 0,
        dateLabel: dateLabel(d.DATE_MODIFY),
        responsible: userMap.get(d.ASSIGNED_BY_ID) || `Usuário ${d.ASSIGNED_BY_ID}`,
        source: sourceMap.get(d.SOURCE_ID) || d.SOURCE_ID || "—",
        pontual: parseMoneyField(d[FIELD_VALOR_PONTUAL]),
        recurring: parseMoneyField(d[FIELD_VALOR_RECORRENTE]),
        tasks: tasksByDealId.get(d.ID) || [],
        phone: d.CONTACT_ID ? phoneMap.get(d.CONTACT_ID) : undefined,
        proposalLink: typeof d[FIELD_PROPOSAL_LINK] === "string"
          ? String(d[FIELD_PROPOSAL_LINK]).trim() || undefined
          : undefined,
      };
      cards[id] = card;
      const col = colByStage.get(d.STAGE_ID);
      if (col) col.cardIds.push(id);
    }

    // Carrega opções dos enums da Reunião realizada (paralelo)
    const enumFieldNames = REUNIAO_FIELDS.filter(
      (f) => f.type === "enum" || f.type === "enum-multi"
    ).map((f) => f.bitrixField);
    const enumOptionsByField = await Promise.all(
      enumFieldNames.map((fn) => fetchEnumOptions(fn))
    );
    const reuniaoFieldOptions: Record<string, EnumOption[]> = {};
    REUNIAO_FIELDS.forEach((f) => {
      if (f.type === "enum" || f.type === "enum-multi") {
        const idx = enumFieldNames.indexOf(f.bitrixField);
        reuniaoFieldOptions[f.key] = enumOptionsByField[idx] || [];
      }
    });

    const state: BoardState = {
      columns,
      cards,
      loseFieldOptions: { motivo: motivoOpts, servicos: servicosOpts },
      reuniaoFieldOptions,
    };
    return NextResponse.json(state);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao buscar board" },
      { status: 500 }
    );
  }
}
