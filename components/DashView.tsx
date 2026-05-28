"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoute } from "@/lib/route";
import { formatBRL } from "@/lib/initialData";

// =============================================================================
// DashView — Dashboard de vendas (Negócio Ganho) do Roberto
// =============================================================================
//
// Mostra Valor R (recorrente) e Valor P (pontual) mês a mês, com summary
// no topo e bar chart embaixo. Filtros: últimos 12 meses (default),
// ano calendário (/dash/<ano>) e range customizado (?de=&ate=).

type MonthBucket = {
  month: string; // YYYY-MM
  pontual: number;
  recurring: number;
  total: number;
  count: number;
};

type DealOut = {
  id: string;
  title: string;
  closeDate: string;
  pontual: number;
  recurring: number;
  total: number;
};

type SalesResponse = {
  range: { from: string; to: string };
  summary: {
    totalPontual: number;
    totalRecurring: number;
    total: number;
    count: number;
  };
  byMonth: MonthBucket[];
  deals: DealOut[];
};

const PT_MONTH_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map((s) => parseInt(s, 10));
  if (!y || !m) return yyyymm;
  return `${PT_MONTH_SHORT[m - 1]}/${String(y).slice(2)}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashView() {
  const { route, setRoute } = useRoute();

  // Anos disponíveis no seletor: do ano atual até 4 anos atrás
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentYear - i),
    [currentYear]
  );

  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decide o range que vai pra API:
  //   1) ?de=&ate= se ambos presentes (range custom)
  //   2) ?mes=YYYY-MM → mês específico (start..end do mês)
  //   3) /dash/<ano> → ano calendário inteiro
  //   4) default → últimos 12 meses (API decide)
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (route.dashDe && route.dashAte) {
      params.set("from", route.dashDe);
      params.set("to", route.dashAte);
    } else if (route.dashMes) {
      const m = route.dashMes;
      const [yr, mn] = m.split("-").map((s) => parseInt(s, 10));
      if (Number.isFinite(yr) && Number.isFinite(mn) && mn >= 1 && mn <= 12) {
        const lastDay = new Date(yr, mn, 0).getDate();
        params.set("from", `${m}-01`);
        params.set("to", `${m}-${String(lastDay).padStart(2, "0")}`);
      }
    } else if (route.dashAno) {
      params.set("from", `${route.dashAno}-01-01`);
      params.set("to", `${route.dashAno}-12-31`);
    }
    const qs = params.toString();
    return qs ? `/api/bitrix/sales?${qs}` : "/api/bitrix/sales";
  }, [route.dashAno, route.dashMes, route.dashDe, route.dashAte]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(apiUrl, { cache: "no-store" });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(d?.error || "Erro ao carregar vendas");
        else setData(d as SalesResponse);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Erro de rede");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // Estado do filtro custom (UI local — só vira URL ao clicar "Aplicar")
  const [customDe, setCustomDe] = useState(route.dashDe);
  const [customAte, setCustomAte] = useState(route.dashAte);
  const [customMes, setCustomMes] = useState(route.dashMes);
  useEffect(() => {
    setCustomDe(route.dashDe);
    setCustomAte(route.dashAte);
    setCustomMes(route.dashMes);
  }, [route.dashDe, route.dashAte, route.dashMes]);

  const activeFilter: "12m" | "thisMonth" | "lastMonth" | "month" | "year" | "custom" =
    route.dashDe && route.dashAte
      ? "custom"
      : route.dashMes
      ? "month"
      : route.dashAno
      ? "year"
      : "12m";

  // Helpers pra "este mês" e "mês passado"
  const thisMonthStr = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const isThisMonth = route.dashMes === thisMonthStr;
  const isLastMonth = route.dashMes === lastMonthStr;

  function applyUltimos12() {
    setRoute({ dashAno: null, dashMes: "", dashDe: "", dashAte: "" });
  }
  function applyAno(yr: number) {
    setRoute({ dashAno: yr, dashMes: "", dashDe: "", dashAte: "" });
  }
  function applyMes(m: string) {
    if (!m) return;
    setRoute({ dashAno: null, dashMes: m, dashDe: "", dashAte: "" });
  }
  function applyCustom() {
    if (!customDe || !customAte) return;
    setRoute({ dashAno: null, dashMes: "", dashDe: customDe, dashAte: customAte });
  }

  return (
    <div className="px-3 sm:px-6 pb-6">
      {/* Filtros */}
      <div className="mb-4 space-y-2.5">
        {/* Linha 1: atalhos de mês + últimos 12 meses */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={applyUltimos12}
            className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
              activeFilter === "12m"
                ? "bg-white text-slate-900 border-white font-medium"
                : "bg-white/[0.06] text-white/70 border-white/15 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            Últimos 12 meses
          </button>
          <button
            onClick={() => applyMes(thisMonthStr)}
            className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
              isThisMonth
                ? "bg-white text-slate-900 border-white font-medium"
                : "bg-white/[0.06] text-white/70 border-white/15 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            Este mês
          </button>
          <button
            onClick={() => applyMes(lastMonthStr)}
            className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
              isLastMonth
                ? "bg-white text-slate-900 border-white font-medium"
                : "bg-white/[0.06] text-white/70 border-white/15 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            Mês passado
          </button>
          {/* Anos como ainda úteis pra ver totais anuais */}
          {yearOptions.map((yr) => {
            const active = activeFilter === "year" && route.dashAno === yr;
            return (
              <button
                key={yr}
                onClick={() => applyAno(yr)}
                className={`text-[12px] px-3 py-1.5 rounded-full border transition ${
                  active
                    ? "bg-white text-slate-900 border-white font-medium"
                    : "bg-white/[0.06] text-white/70 border-white/15 hover:bg-white/[0.12] hover:text-white"
                }`}
              >
                {yr}
              </button>
            );
          })}
        </div>

        {/* Linha 2: pickers de mês específico + range customizado */}
        <div className="flex flex-wrap items-end gap-3 text-[12px]">
          <div>
            <label className="block text-white/50 text-[10px] uppercase tracking-wide mb-1">
              Mês específico
            </label>
            <div className="flex items-center gap-1">
              <input
                type="month"
                value={customMes}
                max={thisMonthStr}
                onChange={(e) => setCustomMes(e.target.value)}
                className="bg-white/[0.06] border border-white/15 rounded-md px-2 py-1 text-white text-[13px] outline-none focus:border-sky-400/60"
              />
              <button
                type="button"
                onClick={() => applyMes(customMes)}
                disabled={!customMes}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  customMes
                    ? activeFilter === "month" && route.dashMes === customMes
                      ? "bg-white text-slate-900"
                      : "bg-sky-500 text-white hover:bg-sky-400"
                    : "bg-white/[0.06] text-white/30 border border-white/10 cursor-not-allowed"
                }`}
              >
                {activeFilter === "month" && route.dashMes === customMes
                  ? "Aplicado ✓"
                  : "Aplicar"}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-white/10 hidden sm:block" />

          <div>
            <label className="block text-white/50 text-[10px] uppercase tracking-wide mb-1">
              Range customizado
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customDe}
                max={customAte || todayISO()}
                onChange={(e) => setCustomDe(e.target.value)}
                className="bg-white/[0.06] border border-white/15 rounded-md px-2 py-1 text-white text-[13px] outline-none focus:border-sky-400/60"
              />
              <span className="text-white/40">→</span>
              <input
                type="date"
                value={customAte}
                min={customDe}
                max={todayISO()}
                onChange={(e) => setCustomAte(e.target.value)}
                className="bg-white/[0.06] border border-white/15 rounded-md px-2 py-1 text-white text-[13px] outline-none focus:border-sky-400/60"
              />
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customDe || !customAte}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition ${
                  customDe && customAte
                    ? activeFilter === "custom"
                      ? "bg-white text-slate-900"
                      : "bg-sky-500 text-white hover:bg-sky-400"
                    : "bg-white/[0.06] text-white/30 border border-white/10 cursor-not-allowed"
                }`}
              >
                {activeFilter === "custom" ? "Aplicado ✓" : "Aplicar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-white/60 text-sm py-6">
          Carregando vendas do Bitrix…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100 mb-3">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            <SummaryCard
              label="Total Valor R"
              value={formatBRL(data.summary.totalRecurring)}
              accent="sky"
            />
            <SummaryCard
              label="Total Valor P"
              value={formatBRL(data.summary.totalPontual)}
              accent="emerald"
            />
            <SummaryCard
              label="Total geral"
              value={formatBRL(data.summary.total)}
              accent="white"
            />
            <SummaryCard
              label="Vendas"
              value={String(data.summary.count)}
              accent="amber"
            />
          </div>

          {/* Chart (esquerda, ~2/3) + Lista de deals (direita, ~1/3).
              Em telas <lg empilha verticalmente, chart em cima. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
            <BarChart byMonth={data.byMonth} />
            <DealsList deals={data.deals} />
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "sky" | "emerald" | "white" | "amber";
}) {
  const accentColors: Record<string, string> = {
    sky: "text-sky-400",
    emerald: "text-emerald-400",
    white: "text-white",
    amber: "text-amber-400",
  };
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-lg p-3">
      <div className="text-[10px] sm:text-[11px] text-white/50 uppercase tracking-wide font-medium">
        {label}
      </div>
      <div
        className={`mt-1 text-base sm:text-lg font-semibold ${accentColors[accent]}`}
      >
        {value}
      </div>
    </div>
  );
}

function BarChart({ byMonth }: { byMonth: MonthBucket[] }) {
  // Pega o pico geral pra normalizar as alturas.
  const max = useMemo(() => {
    let m = 0;
    for (const b of byMonth) {
      m = Math.max(m, b.recurring, b.pontual);
    }
    return m || 1;
  }, [byMonth]);

  // Formatador compacto pros valores que ficam acima das barras
  // (R$ 28.997 → "29K", R$ 1.500.000 → "1,5M"). Mantém o eixo X limpo
  // sem que valores grandes quebrem o layout.
  function compactBRL(v: number): string {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace(".", ",")}M`;
    if (v >= 1000) return `${Math.round(v / 1000)}K`;
    return String(Math.round(v));
  }

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white/80 text-sm font-medium">Vendas mês a mês</h3>
        <div className="flex items-center gap-3 text-[11px] text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Valor R
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Valor P
          </span>
        </div>
      </div>

      {/* overflow-x-auto pra muitos meses; pt-6 dá espaço pros valores
          acima das barras não cortarem com o topo do container. */}
      <div className="flex items-end gap-1.5 sm:gap-2 h-56 overflow-x-auto col-scroll pb-2 pt-6">
        {byMonth.map((b) => {
          const hR = (b.recurring / max) * 100;
          const hP = (b.pontual / max) * 100;
          return (
            <div
              key={b.month}
              className="flex-1 min-w-[44px] flex flex-col items-stretch h-full"
              title={`${formatMonthLabel(b.month)} — R: ${formatBRL(b.recurring)} | P: ${formatBRL(b.pontual)} | ${b.count} venda(s)`}
            >
              <div className="flex-1 flex items-end gap-0.5 sm:gap-1">
                {/* Barra R (sky). Valor sempre visível em cima — sem
                    depender de hover (resolve bug de o tooltip ficar
                    fora da área visível pra barras altas como o MAI). */}
                <div
                  className="flex-1 bg-sky-500/80 hover:bg-sky-500 rounded-t-sm transition relative"
                  style={{ height: `${Math.max(hR, b.recurring > 0 ? 2 : 0)}%` }}
                >
                  {b.recurring > 0 && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-sky-300 whitespace-nowrap font-medium">
                      {compactBRL(b.recurring)}
                    </div>
                  )}
                </div>
                <div
                  className="flex-1 bg-emerald-500/80 hover:bg-emerald-500 rounded-t-sm transition relative"
                  style={{ height: `${Math.max(hP, b.pontual > 0 ? 2 : 0)}%` }}
                >
                  {b.pontual > 0 && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-emerald-300 whitespace-nowrap font-medium">
                      {compactBRL(b.pontual)}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-center text-[10px] text-white/50 mt-1 truncate">
                {formatMonthLabel(b.month)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DealsList({ deals }: { deals: DealOut[] }) {
  if (deals.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 text-center text-white/40 text-sm">
        Nenhuma venda no período.
      </div>
    );
  }
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden flex flex-col lg:max-h-[400px]">
      <div className="px-3 sm:px-4 py-2.5 border-b border-white/10 text-white/80 text-sm font-medium shrink-0">
        {deals.length} venda{deals.length === 1 ? "" : "s"} no período
      </div>
      <div className="divide-y divide-white/5 overflow-y-auto col-scroll flex-1">
        {deals.map((d) => {
          const dt = new Date(d.closeDate);
          const dtLabel = isNaN(dt.getTime())
            ? "—"
            : `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
          return (
            <div
              key={d.id}
              className="px-3 sm:px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition"
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-[12px] truncate font-medium">
                  {d.title}
                </div>
                <div className="text-white/40 text-[10px]">{dtLabel}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-sky-400">
                  R {formatBRL(d.recurring)}
                </div>
                <div className="text-[10px] text-emerald-400">
                  P {formatBRL(d.pontual)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
