import { NextResponse } from "next/server";
import { bitrixListAll } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

// Cache simples em memória pra resposta inteira — primeiro hit paga
// ~15s, hits subsequentes (mesmo range) voltam em <50ms. Range é a
// chave. TTL curto pra refletir mudanças no Bitrix em poucos minutos.
type CacheEntry = { value: any; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const RESPONSE_TTL_MS = 5 * 60 * 1000;

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

    // Cache hit por range — reaproveita até 5min. As métricas raramente
    // mudam a cada segundo e o endpoint custa ~15s pra 12 meses.
    const cacheK = `${responsibleId}::${from.toISOString()}::${to.toISOString()}`;
    const hit = responseCache.get(cacheK);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.value, {
        headers: { "X-Cache": "HIT" },
      });
    }

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return NextResponse.json(
        { error: "from/to inválidos (use YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // 5 queries em paralelo:
    //   1 — stage history das entradas em NEW no período (qualquer dono)
    //   1 — TODOS os deals atualmente do Roberto (sem filtro de data)
    //       — usamos como tabela hash em memória pra resolver ASSIGNED_BY_ID
    //       das stage entries sem precisar de N batches de crm.deal.list.
    //       Pra 12 meses isso reduz ~36 round-trips a 1.
    //   3 — won/lost/frozen do Roberto fechados no período (por CLOSEDATE)
    const baseAssign = { ASSIGNED_BY_ID: responsibleId };
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const [stageEntries, robertoDeals, won, lost, frozen] = await Promise.all([
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
        filter: { ...baseAssign },
        select: ["ID", "TITLE"],
      }),
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

    // Hash de deals do Roberto pra resolver title + filtrar stage entries.
    const robertoDealsById = new Map<string, RawDeal>();
    for (const d of robertoDeals) robertoDealsById.set(String(d.ID), d);

    // Cada entrada em NEW que pertence a um deal do Roberto vira 1
    // reunião. Dedupa por OWNER_ID (mesmo deal entrando em NEW 2x ainda
    // vale 1). Guarda a 1ª data cronologicamente.
    const robertoReunioesSet = new Map<
      string,
      { id: string; title: string; createdTime: string }
    >();
    for (const entry of stageEntries) {
      const ownerId = String(entry.OWNER_ID);
      const deal = robertoDealsById.get(ownerId);
      if (!deal) continue; // não é deal do Roberto
      const existing = robertoReunioesSet.get(ownerId);
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

    const payload = {
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
    };
    responseCache.set(cacheK, {
      value: payload,
      expiresAt: Date.now() + RESPONSE_TTL_MS,
    });
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao calcular conversão" },
      { status: 500 }
    );
  }
}
