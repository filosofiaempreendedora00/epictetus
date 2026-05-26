import { NextResponse } from "next/server";
import { listCalendarEvents } from "@/lib/google";

export const dynamic = "force-dynamic";

// GET /api/google/events?from=ISO&to=ISO
// Devolve eventos do calendário primário no intervalo.
// Se from/to não vierem, usa "hoje" e "+14 dias".
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const now = new Date();
  const from = fromParam ? new Date(fromParam) : startOfDay(now);
  const to = toParam ? new Date(toParam) : addDays(startOfDay(now), 14);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json(
      { error: "Parâmetros from/to inválidos (esperado ISO date)" },
      { status: 400 }
    );
  }

  try {
    const events = await listCalendarEvents(from, to);
    return NextResponse.json({ events });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Erro ao ler agenda do Google" },
      { status: 500 }
    );
  }
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
