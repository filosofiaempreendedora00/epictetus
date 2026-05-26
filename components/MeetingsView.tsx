"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoute, type DateView } from "@/lib/route";

// Tipo do evento espelhado de lib/google.ts. NÃO importamos de lá pra
// não puxar o googleapis (pacote pesado, server-only) pro bundle do client.
type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  hangoutLink?: string;
  htmlLink: string;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  organizer?: { email?: string; name?: string };
  status: string;
};

// =============================================================================
// MeetingsView — agenda do Google em grade de dias
// =============================================================================
//
// Layout sigue o padrão do TasksView (DayColumnsView):
//   - Desktop ≥sm: grade horizontal (7 ou 14 colunas)
//   - Mobile <sm: lista vertical empilhada, cada dia com header próprio
//
// Diferenças vs Tarefas:
//   - Sem filtro por tipo (eventos têm livre estrutura)
//   - Sem drag-and-drop (não reagendamos eventos por aqui)
//   - Item de evento mostra hora + título + (se houver) link do Meet
//   - "Mensal" não existe — reuniões fazem sentido no curto prazo

const DOW_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
const PT_MONTH_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function startOfWeekSunday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function MeetingsView() {
  const { route, setRoute } = useRoute();
  const dateView = route.dateView === "monthly" ? "biweekly" : route.dateView;
  const days = dateView === "biweekly" ? 14 : 7;
  const weekOffset = route.weekOffset;
  const setWeekOffset = (v: number) => setRoute({ weekOffset: v });
  const setDateView = (v: DateView) => setRoute({ dateView: v });

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const start = addDays(startOfWeekSunday(now), weekOffset * 7);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const lastDay = dayList[dayList.length - 1];
  const endExclusive = addDays(lastDay, 1);
  const weekSpan = days === 7 ? 1 : 2;

  // Refetch sempre que muda o range
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const url = `/api/google/events?from=${encodeURIComponent(
          start.toISOString()
        )}&to=${encodeURIComponent(endExclusive.toISOString())}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || "Erro ao carregar eventos");
        } else {
          setEvents((data.events as CalendarEvent[]) || []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Erro de rede");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, days]);

  // Agrupa eventos por dia (chave YYYY-MM-DD).
  // Eventos all-day caem em todos os dias do range deles.
  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const startD = new Date(ev.start);
      const endD = new Date(ev.end);
      if (isNaN(startD.getTime()) || isNaN(endD.getTime())) continue;
      if (ev.allDay) {
        // Google envia eventos all-day com end exclusivo (1 dia depois).
        // Iteramos do start até end (exclusivo).
        const cursor = new Date(startD);
        while (cursor < endD) {
          const key = dayKey(cursor);
          if (!m.has(key)) m.set(key, []);
          m.get(key)!.push(ev);
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        const key = dayKey(startD);
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(ev);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    }
    return m;
  }, [events]);

  function formatRange(a: Date, b: Date) {
    const sameMonth = a.getMonth() === b.getMonth();
    const sameYear = a.getFullYear() === b.getFullYear();
    if (sameMonth && sameYear) {
      return `${a.getDate()} – ${b.getDate()} de ${PT_MONTH_LONG[a.getMonth()]} ${a.getFullYear()}`;
    }
    if (sameYear) {
      return `${a.getDate()} ${PT_MONTH_LONG[a.getMonth()]} – ${b.getDate()} ${PT_MONTH_LONG[b.getMonth()]} ${a.getFullYear()}`;
    }
    return `${a.getDate()} ${PT_MONTH_LONG[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${PT_MONTH_LONG[b.getMonth()]} ${b.getFullYear()}`;
  }

  // Erro de credenciais não configuradas: mensagem amigável com link pra setup.
  if (error && /GOOGLE_REFRESH_TOKEN|GOOGLE_CLIENT_ID|Credenciais Google/i.test(error)) {
    return (
      <div className="px-3 sm:px-6 pb-6">
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="font-medium mb-2">
            Google Agenda ainda não conectado
          </div>
          <div className="opacity-90 mb-3">
            Pra ver suas reuniões aqui, você precisa autorizar o app no Google
            uma vez. Detalhes:
          </div>
          <pre className="text-[11px] opacity-70 bg-black/30 p-2 rounded mb-3 whitespace-pre-wrap break-all">
            {error}
          </pre>
          <a
            href="/api/google/auth"
            className="inline-flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-3 py-2 rounded-lg transition"
          >
            Conectar Google →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 pb-6">
      {/* Switcher de período (sem "mensal" — não faz sentido pra reuniões) */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="inline-flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-lg p-1">
          {(
            [
              { key: "weekly", label: "Semanal" },
              { key: "biweekly", label: "2 Semanas" },
            ] as { key: DateView; label: string }[]
          ).map((o) => (
            <button
              key={o.key}
              onClick={() => setDateView(o.key)}
              className={`px-3 py-1 text-[12px] rounded-md transition ${
                dateView === o.key
                  ? "bg-white/15 text-white font-medium shadow-sm"
                  : "text-white/55 hover:text-white/85"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <a
          href="https://calendar.google.com/calendar/u/0/r"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-white/60 hover:text-white/90 transition"
        >
          Abrir no Google Agenda ↗
        </a>
      </div>

      {/* Navegação de semanas */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setWeekOffset(weekOffset - weekSpan)}
          className="w-9 h-9 sm:w-7 sm:h-7 inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white transition"
          title="Semana anterior"
          aria-label="Semana anterior"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setWeekOffset(weekOffset + weekSpan)}
          className="w-9 h-9 sm:w-7 sm:h-7 inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white transition"
          title="Próxima semana"
          aria-label="Próxima semana"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <div className="text-white/80 text-[13px] font-medium min-w-0 flex-1 truncate">
          {formatRange(start, lastDay)}
        </div>
        {weekOffset !== 0 && (
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="ml-auto sm:ml-2 text-[12px] px-3 sm:px-2 py-1.5 sm:py-1 rounded-md border border-white/15 bg-white/[0.04] text-white/70 hover:bg-white/10 hover:text-white transition"
            title="Voltar pra semana atual"
          >
            Hoje
          </button>
        )}
      </div>

      {loading && (
        <div className="text-white/60 text-sm py-6">
          Carregando agenda do Google…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100 mb-3">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="border-t border-white/10">
          {/* Cabeçalho de dias (só desktop) */}
          <div className="hidden sm:flex">
            {dayList.map((d) => {
              const today = isSameDay(d, now);
              return (
                <div
                  key={dayKey(d)}
                  className="flex-1 min-w-0 border-r border-white/5 px-2 py-2 flex items-baseline gap-2"
                >
                  <span className="text-white/40 text-[11px] uppercase tracking-wide">
                    {DOW_SHORT[d.getDay()]}
                  </span>
                  {today ? (
                    <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full w-5 h-5 inline-flex items-center justify-center">
                      {d.getDate()}
                    </span>
                  ) : (
                    <span className="text-white/70 text-[12px] font-medium">
                      {d.getDate()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Células — empilhadas em mobile, lado a lado em desktop */}
          <div
            className="flex flex-col sm:flex-row"
            style={{ minHeight: "calc(100dvh - 280px)" }}
          >
            {dayList.map((d) => (
              <DayCell
                key={dayKey(d)}
                date={d}
                isToday={isSameDay(d, now)}
                events={eventsByDay.get(dayKey(d)) || []}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DayCell({
  date,
  isToday,
  events,
}: {
  date: Date;
  isToday: boolean;
  events: CalendarEvent[];
}) {
  return (
    <div
      className={`w-full sm:flex-1 sm:min-w-0 border-b sm:border-b-0 sm:border-r border-white/5 p-1.5 space-y-1.5 sm:overflow-y-auto sm:col-scroll sm:max-h-[calc(100dvh-280px)] ${
        isToday ? "bg-white/[0.03]" : ""
      }`}
    >
      {/* Header do dia — só em mobile */}
      <div className="sm:hidden flex items-baseline gap-2 pb-1 mb-1 border-b border-white/5">
        <span className="text-white/40 text-[11px] uppercase tracking-wide">
          {DOW_SHORT[date.getDay()]}
        </span>
        {isToday ? (
          <span className="bg-red-500 text-white text-[11px] font-semibold rounded-full w-5 h-5 inline-flex items-center justify-center">
            {date.getDate()}
          </span>
        ) : (
          <span className="text-white/70 text-[12px] font-medium">
            {date.getDate()}
          </span>
        )}
        <span className="text-white/40 text-[11px]">
          {PT_MONTH_LONG[date.getMonth()]}
        </span>
        {events.length > 0 && (
          <span className="ml-auto text-white/40 text-[11px]">
            {events.length} {events.length === 1 ? "reunião" : "reuniões"}
          </span>
        )}
      </div>

      {events.length === 0 && (
        <div className="text-center text-white/15 text-[10px] py-4 select-none">
          —
        </div>
      )}

      {events.map((ev) => (
        <EventCard key={ev.id} event={ev} />
      ))}
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const startD = new Date(event.start);
  const endD = new Date(event.end);
  const timeLabel = event.allDay
    ? "dia inteiro"
    : `${fmtTime(startD)}–${fmtTime(endD)}`;
  const cancelled = event.status === "cancelled";
  // Cor do card baseada em status. Reuniões com Meet ficam mais
  // destacadas (azul "google") pra serem fáceis de identificar visualmente.
  const baseClass = cancelled
    ? "bg-white/5 border-white/10 line-through opacity-60"
    : event.hangoutLink
    ? "bg-sky-50 border-sky-200"
    : "bg-white border-slate-200";
  const textColor = cancelled ? "text-white/70" : "text-slate-900";
  const subColor = cancelled ? "text-white/50" : "text-slate-500";

  return (
    <div
      className={`relative rounded-md shadow-sm px-2 py-1.5 border ${baseClass}`}
    >
      <div className={`text-[10px] font-medium ${subColor}`}>{timeLabel}</div>
      <div className={`text-[12px] font-medium leading-snug break-words ${textColor}`}>
        {event.title}
      </div>
      {event.location && !event.hangoutLink && (
        <div className={`text-[10px] mt-0.5 leading-snug break-words ${subColor}`}>
          📍 {event.location}
        </div>
      )}
      <div className="mt-1 flex items-center gap-2">
        {event.hangoutLink && (
          <a
            href={event.hangoutLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-sky-700 hover:text-sky-900 font-medium"
            title="Abrir Google Meet"
          >
            🎥 Meet
          </a>
        )}
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-[10px] ${subColor} hover:underline`}
            title="Abrir no Google Agenda"
          >
            ↗ agenda
          </a>
        )}
        {event.attendees.length > 1 && (
          <span className={`text-[10px] ${subColor}`}>
            👥 {event.attendees.length}
          </span>
        )}
      </div>
    </div>
  );
}
