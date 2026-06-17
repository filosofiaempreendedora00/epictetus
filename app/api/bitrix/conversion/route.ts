import { NextResponse } from "next/server";
import { bitrixListAll } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

// =============================================================================
// /api/bitrix/conversion — métricas de performance/conversão do Roberto
// =============================================================================
//
// Para um intervalo (default últimos 12 meses), devolve:
//   summary:
//     reunioesRealizadas  = deals do Roberto que entraram na coluna NEW
//                           ("Reunião realizada") no período — via
//                           crm.stagehistory.list. Conta deals únicos
//                           (se um mesmo deal entrou em NEW 2x no mês,
//                           continua valendo 1).
//                           Antes era por DATE_CREATE, mas isso ignorava
//                           leads antigos que tiveram reunião nova no mês
//                           (deal de mai/26 com reunião em jun/26 era
//                           invisível pra métrica — Roberto pegou isso).
//     ganhos              = deals atualmente em WON e fechados no período
//     perdidos            = deals em APOLOGY ("Negócio perdido") fechados no período
//     congelados          = deals em LOSE ("Congelado") fechados no período
//     taxaConversao       = ganhos / (ganhos + perdidos)
//                           — excluí "congelados" porque podem reabrir
//     taxaConversaoTotal  = ganhos / reunioesRealizadas (mais conservador)
//   byMonth: [{ month, reunioesRealizadas, ganhos, perdidos, congelados }]

const NEW_STAGE = "NEW";        // "Reunião realizada" — denominador
const WON_STAGE = "WON";
const LOSE_STAGE = "LOSE";
const APOLOGY_STAGE = "APOLOGY";

type RawDeal = {
  ID: string;
  TITLE?: string;
  STAGE_ID?: string;
  DATE_CREATE?: string;
  CLOSEDATE?: string;
  ASSIGNED_BY_ID?: string;
};

// crm.stagehistory.list (entityTypeId=2) — registro de transição de stage
type RawStageEntry = {
  ID: number;
  OWNER_ID: number;
  STAGE_ID: string;
  CREATED_TIME: string;
};

function brShort(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  try {
    const responsibleId = process.env.BITRIX_RESPONSIBLE_USER_ID;
    if (!responsibleId) {
      return NextResponse.json(
        { error: "BITRIX_RESPONSIBLE_USER_ID não configurado" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const now = new Date();
    let from: Date;
    let to: Date;
    if (fromParam) {
      from = new Date(fromParam);
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
    }
    if (toParam) {
      to = new Date(toParam);
      to.setHours(23, 59, 59, 999);
    } else {
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "from/to inválidos (use YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // 3 queries de fechamento em paralelo (won/lost/frozen) + 1 separada
    // pra stage history das entradas em NEW. A 5ª (deals por ID, pra cruzar
    // com Roberto) só pode rodar depois que a stage history voltar.
    const baseAssign = { ASSIGNED_BY_ID: responsibleId };
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const [stageEntries, won, lost, frozen] = await Promise.all([
      // Todas as transições pra NEW no período (qualquer responsável).
      // Não dá pra filtrar por ASSIGNED_BY_ID aqui — esse campo é do deal,
      // não da entrada de stage history. Cruzamos depois.
      bitrixListAll<RawStageEntry>(
        "crm.stagehistory.list",
        {
          entityTypeId: 2, // deal
          filter: {
            STAGE_ID: NEW_STAGE,
            ">=CREATED_TIME": fromIso,
            "<=CREATED_TIME": toIso,
          },
          select: ["ID", "OWNER_ID", "STAGE_ID", "CREATED_TIME"],
          order: { CREATED_TIME: "ASC" },
        },
        { itemsField: "items" }
      ),
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          STAGE_ID: WON_STAGE,
          ">=CLOSEDATE": fromIso,
          "<=CLOSEDATE": toIso,
        },
        select: ["ID", "TITLE", "CLOSEDATE"],
      }),
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          STAGE_ID: APOLOGY_STAGE,
          ">=CLOSEDATE": fromIso,
          "<=CLOSEDATE": toIso,
        },
        select: ["ID", "TITLE", "CLOSEDATE"],
      }),
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          STAGE_ID: LOSE_STAGE,
          ">=CLOSEDATE": fromIso,
          "<=CLOSEDATE": toIso,
        },
        select: ["ID", "TITLE", "CLOSEDATE"],
      }),
    ]);

    // Resolve quem é o ASSIGNED_BY_ID de cada deal que entrou em NEW e
    // filtra só os do Roberto. Como o universo pode ser grande (~150
    // transições/mês), fatiamos em batches de 50 IDs por crm.deal.list.
    const uniqueOwnerIds = [
      ...new Set(stageEntries.map((e) => String(e.OWNER_ID))),
    ];
    const dealsById = new Map<string, RawDeal>();
    const CHUNK = 50;
    for (let i = 0; i < uniqueOwnerIds.length; i += CHUNK) {
      const ids = uniqueOwnerIds.slice(i, i + CHUNK);
      const batch = await bitrixListAll<RawDeal>("crm.deal.list", {
        filter: { ID: ids },
        select: ["ID", "TITLE", "STAGE_ID", "ASSIGNED_BY_ID", "DATE_CREATE"],
      });
      for (const d of batch) dealsById.set(String(d.ID), d);
    }

    // Cada entrada em NEW + dados do deal → mantém só do Roberto e dedupa
    // por OWNER_ID (1 deal = 1 reunião, mesmo se entrou em NEW 2x).
    const robertoReunioesSet = new Map<
      string,
      { id: string; title: string; createdTime: string }
    >();
    for (const entry of stageEntries) {
      const ownerId = String(entry.OWNER_ID);
      const deal = dealsById.get(ownerId);
      if (!deal) continue;
      if (deal.ASSIGNED_BY_ID !== responsibleId) continue;
      const existing = robertoReunioesSet.get(ownerId);
      // Guarda a 1ª entrada cronologicamente (já vem em ASC pelo order
      // acima, mas double-check).
      if (
        !existing ||
        (entry.CREATED_TIME || "") < (existing.createdTime || "")
      ) {
        robertoReunioesSet.set(ownerId, {
          id: ownerId,
          title: deal.TITLE || "(sem título)",
          createdTime: entry.CREATED_TIME,
        });
      }
    }
    const reunioes = [...robertoReunioesSet.values()];

    type Bucket = {
      month: string;
      reunioesRealizadas: number;
      ganhos: number;
      perdidos: number;
      congelados: number;
    };
    const map = new Map<string, Bucket>();
    function ensure(m: string): Bucket {
      let b = map.get(m);
      if (!b) {
        b = {
          month: m,
          reunioesRealizadas: 0,
          ganhos: 0,
          perdidos: 0,
          congelados: 0,
        };
        map.set(m, b);
      }
      return b;
    }

    for (const r of reunioes) {
      const dt = r.createdTime ? new Date(r.createdTime) : null;
      if (!dt || isNaN(dt.getTime())) continue;
      ensure(monthKey(dt)).reunioesRealizadas++;
    }
    for (const d of won) {
      const dt = d.CLOSEDATE ? new Date(d.CLOSEDATE) : null;
      if (!dt || isNaN(dt.getTime())) continue;
      ensure(monthKey(dt)).ganhos++;
    }
    for (const d of lost) {
      const dt = d.CLOSEDATE ? new Date(d.CLOSEDATE) : null;
      if (!dt || isNaN(dt.getTime())) continue;
      ensure(monthKey(dt)).perdidos++;
    }
    for (const d of frozen) {
      const dt = d.CLOSEDATE ? new Date(d.CLOSEDATE) : null;
      if (!dt || isNaN(dt.getTime())) continue;
      ensure(monthKey(dt)).congelados++;
    }

    // Gap-fill: preenche meses sem dados com zero pra o gráfico não pular.
    const filled: Bucket[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= end) {
      const key = monthKey(cursor);
      filled.push(
        map.get(key) || {
          month: key,
          reunioesRealizadas: 0,
          ganhos: 0,
          perdidos: 0,
          congelados: 0,
        }
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const reunioesRealizadas = reunioes.length;
    const ganhos = won.length;
    const perdidos = lost.length;
    const congelados = frozen.length;
    const decididos = ganhos + perdidos;
    const taxaConversao = decididos > 0 ? ganhos / decididos : 0;
    const taxaConversaoTotal =
      reunioesRealizadas > 0 ? ganhos / reunioesRealizadas : 0;

    // Pra drill-down (clicar num indicador → modal com a lista de deals).
    function pack(
      arr: RawDeal[],
      dateField: "DATE_CREATE" | "CLOSEDATE"
    ): { id: string; title: string; date: string }[] {
      return arr
        .map((d) => ({
          id: String(d.ID),
          title: d.TITLE || "(sem título)",
          date: brShort(d[dateField]),
          rawDate: d[dateField] || "",
        }))
        .sort((a, b) => b.rawDate.localeCompare(a.rawDate))
        .map(({ id, title, date }) => ({ id, title, date }));
    }

    // Reuniões têm shape diferente (data = entrada em NEW, não DATE_CREATE).
    const packedReunioes = reunioes
      .map((r) => ({
        id: r.id,
        title: r.title,
        date: brShort(r.createdTime),
        rawDate: r.createdTime,
      }))
      .sort((a, b) => b.rawDate.localeCompare(a.rawDate))
      .map(({ id, title, date }) => ({ id, title, date }));

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        reunioesRealizadas,
        ganhos,
        perdidos,
        congelados,
        taxaConversao,       // ganhos / (ganhos + perdidos)
        taxaConversaoTotal,  // ganhos / reunioes (mais conservador)
      },
      byMonth: filled,
      deals: {
        reunioes: packedReunioes,
        ganhos: pack(won, "CLOSEDATE"),
        perdidos: pack(lost, "CLOSEDATE"),
        congelados: pack(frozen, "CLOSEDATE"),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao calcular conversão" },
      { status: 500 }
    );
  }
}
