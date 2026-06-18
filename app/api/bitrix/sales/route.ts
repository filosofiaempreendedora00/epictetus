import { NextResponse } from "next/server";
import { bitrixListAll } from "@/lib/bitrix";

export const dynamic = "force-dynamic";

const FIELD_VALOR_PONTUAL = "UF_CRM_1752256743002";
const FIELD_VALOR_RECORRENTE = "UF_CRM_1752256871802";
const WON_STAGE_ID = "WON";

// Cache em memória curto pra evitar refetch em refreshes/navegação.
type CacheEntry = { value: any; expiresAt: number };
const responseCache = new Map<string, CacheEntry>();
const RESPONSE_TTL_MS = 5 * 60 * 1000;

type RawDeal = {
  ID: string;
  TITLE?: string;
  CLOSEDATE?: string;
  [key: string]: any;
};

function parseMoneyField(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const str = String(raw);
  const pipeIdx = str.indexOf("|");
  const numStr = pipeIdx >= 0 ? str.slice(0, pipeIdx) : str;
  const n = parseFloat(numStr);
  return isNaN(n) ? 0 : n;
}

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// GET /api/bitrix/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
// Sem from/to → últimos 12 meses (do início do mês N-11 até final de hoje).
//
// Devolve:
//   summary: { totalPontual, totalRecurring, total, count }
//   byMonth: [{ month, pontual, recurring, total, count }]   ordenado ascendente
//   deals:   [{ id, title, closeDate, pontual, recurring, total }]
//
// Filtros aplicados no Bitrix:
//   STAGE_ID = WON (Negócio Ganho)
//   ASSIGNED_BY_ID = BITRIX_RESPONSIBLE_USER_ID (Roberto)
//   CLOSEDATE BETWEEN from AND to
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
      // Default: 12 meses atrás, início do mês
      from = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
    }
    if (toParam) {
      to = new Date(toParam);
      // Inclui o dia inteiro do "ate"
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

    const cacheK = `${responsibleId}::${from.toISOString()}::${to.toISOString()}`;
    const hit = responseCache.get(cacheK);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.value, { headers: { "X-Cache": "HIT" } });
    }

    const deals = await bitrixListAll<RawDeal>("crm.deal.list", {
      filter: {
        STAGE_ID: WON_STAGE_ID,
        ASSIGNED_BY_ID: responsibleId,
        ">=CLOSEDATE": from.toISOString(),
        "<=CLOSEDATE": to.toISOString(),
      },
      select: [
        "ID",
        "TITLE",
        "CLOSEDATE",
        FIELD_VALOR_PONTUAL,
        FIELD_VALOR_RECORRENTE,
      ],
      order: { CLOSEDATE: "ASC" },
    });

    type DealOut = {
      id: string;
      title: string;
      closeDate: string;
      pontual: number;
      recurring: number;
      total: number;
    };
    type MonthBucket = {
      month: string;
      pontual: number;
      recurring: number;
      total: number;
      count: number;
    };

    const dealsOut: DealOut[] = [];
    const byMonthMap = new Map<string, MonthBucket>();
    let totalP = 0;
    let totalR = 0;

    for (const d of deals) {
      const closeDateStr = d.CLOSEDATE || "";
      const closeDate = new Date(closeDateStr);
      if (isNaN(closeDate.getTime())) continue;
      const p = parseMoneyField(d[FIELD_VALOR_PONTUAL]);
      const r = parseMoneyField(d[FIELD_VALOR_RECORRENTE]);
      const t = p + r;
      dealsOut.push({
        id: String(d.ID),
        title: d.TITLE || "(sem título)",
        closeDate: closeDateStr,
        pontual: p,
        recurring: r,
        total: t,
      });
      totalP += p;
      totalR += r;
      const key = monthKey(closeDate);
      const bucket = byMonthMap.get(key) || {
        month: key,
        pontual: 0,
        recurring: 0,
        total: 0,
        count: 0,
      };
      bucket.pontual += p;
      bucket.recurring += r;
      bucket.total += t;
      bucket.count += 1;
      byMonthMap.set(key, bucket);
    }

    // Preenche meses sem vendas com zeros (pra o gráfico ter eixo X
    // contínuo, ex.: mostrar "Fev: 0" em vez de pular).
    const monthsFilled: MonthBucket[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cursor <= end) {
      const key = monthKey(cursor);
      monthsFilled.push(
        byMonthMap.get(key) || {
          month: key,
          pontual: 0,
          recurring: 0,
          total: 0,
          count: 0,
        }
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const payload = {
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalPontual: totalP,
        totalRecurring: totalR,
        total: totalP + totalR,
        count: dealsOut.length,
      },
      byMonth: monthsFilled,
      deals: dealsOut,
    };
    responseCache.set(cacheK, {
      value: payload,
      expiresAt: Date.now() + RESPONSE_TTL_MS,
    });
    return NextResponse.json(payload, { headers: { "X-Cache": "MISS" } });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao carregar vendas" },
      { status: 500 }
    );
  }
}
