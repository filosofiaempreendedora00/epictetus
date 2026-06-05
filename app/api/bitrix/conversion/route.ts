import { NextResponse } from "next/server";
import { bitrixListAll } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

// =============================================================================
// /api/bitrix/conversion — métricas de performance/conversão do Roberto
// =============================================================================
//
// Para um intervalo (default últimos 12 meses), devolve:
//   summary:
//     reunioesRealizadas  = deals criados (DATE_CREATE) no período
//                           — todo deal começa em NEW = "Reunião realizada"
//     ganhos              = deals atualmente em WON e fechados no período
//     perdidos            = deals em APOLOGY ("Negócio perdido") fechados no período
//     congelados          = deals em LOSE ("Congelado") fechados no período
//     taxaConversao       = ganhos / (ganhos + perdidos)
//                           — excluí "congelados" porque podem reabrir
//     taxaConversaoTotal  = ganhos / reunioesRealizadas (mais conservador)
//   byMonth: [{ month, reunioesRealizadas, ganhos, perdidos, congelados }]
//
// Bem-vindo aprofundar depois — esse é o v1.

const WON_STAGE = "WON";
const LOSE_STAGE = "LOSE";
const APOLOGY_STAGE = "APOLOGY";

type RawDeal = {
  ID: string;
  STAGE_ID?: string;
  DATE_CREATE?: string;
  CLOSEDATE?: string;
};

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

    // 4 queries em paralelo: criados (por DATE_CREATE) + 3 stages finais (por CLOSEDATE).
    // O semáforo de lib/bitrix.ts já limita concorrência total a 2.
    const baseAssign = { ASSIGNED_BY_ID: responsibleId };
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const [created, won, lost, frozen] = await Promise.all([
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          ">=DATE_CREATE": fromIso,
          "<=DATE_CREATE": toIso,
        },
        select: ["ID", "STAGE_ID", "DATE_CREATE"],
      }),
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          STAGE_ID: WON_STAGE,
          ">=CLOSEDATE": fromIso,
          "<=CLOSEDATE": toIso,
        },
        select: ["ID", "CLOSEDATE"],
      }),
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          STAGE_ID: APOLOGY_STAGE,
          ">=CLOSEDATE": fromIso,
          "<=CLOSEDATE": toIso,
        },
        select: ["ID", "CLOSEDATE"],
      }),
      bitrixListAll<RawDeal>("crm.deal.list", {
        filter: {
          ...baseAssign,
          STAGE_ID: LOSE_STAGE,
          ">=CLOSEDATE": fromIso,
          "<=CLOSEDATE": toIso,
        },
        select: ["ID", "CLOSEDATE"],
      }),
    ]);

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

    for (const d of created) {
      const dt = d.DATE_CREATE ? new Date(d.DATE_CREATE) : null;
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

    const reunioesRealizadas = created.length;
    const ganhos = won.length;
    const perdidos = lost.length;
    const congelados = frozen.length;
    const decididos = ganhos + perdidos;
    const taxaConversao = decididos > 0 ? ganhos / decididos : 0;
    const taxaConversaoTotal =
      reunioesRealizadas > 0 ? ganhos / reunioesRealizadas : 0;

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
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao calcular conversão" },
      { status: 500 }
    );
  }
}
