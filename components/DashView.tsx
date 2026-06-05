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

// Tipos pro /api/bitrix/conversion
type ConvMonthBucket = {
  month: string;
  reunioesRealizadas: number;
  ganhos: number;
  perdidos: number;
  congelados: number;
};
type ConvDealRef = { id: string; title: string; date: string };
type ConversionResponse = {
  range: { from: string; to: string };
  summary: {
    reunioesRealizadas: number;
    ganhos: number;
    perdidos: number;
    congelados: number;
    taxaConversao: number;
    taxaConversaoTotal: number;
  };
  byMonth: ConvMonthBucket[];
  deals: {
    reunioes: ConvDealRef[];
    ganhos: ConvDealRef[];
    perdidos: ConvDealRef[];
    congelados: ConvDealRef[];
  };
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
  const [conversion, setConversion] = useState<ConversionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decide o range que vai pra API. A mesma query string serve pros 2
  // endpoints (sales + conversion).
  //   1) ?de=&ate= se ambos presentes (range custom)
  //   2) ?mes=YYYY-MM → mês específico (start..end do mês)
  //   3) /dash/<ano> → ano calendário inteiro
  //   4) default → últimos 12 meses (API decide)
  const queryString = useMemo(() => {
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
    return params.toString();
  }, [route.dashAno, route.dashMes, route.dashDe, route.dashAte]);

  const salesUrl = queryString
    ? `/api/bitrix/sales?${queryString}`
    : "/api/bitrix/sales";
  const conversionUrl = queryString
    ? `/api/bitrix/conversion?${queryString}`
    : "/api/bitrix/conversion";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [salesRes, convRes] = await Promise.all([
          fetch(salesUrl, { cache: "no-store" }),
          fetch(conversionUrl, { cache: "no-store" }),
        ]);
        const salesJson = await salesRes.json();
        const convJson = await convRes.json();
        if (cancelled) return;
        if (!salesRes.ok) {
          setError(salesJson?.error || "Erro ao carregar vendas");
          return;
        }
        if (!convRes.ok) {
          setError(convJson?.error || "Erro ao carregar conversão");
          return;
        }
        setData(salesJson as SalesResponse);
        setConversion(convJson as ConversionResponse);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Erro de rede");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salesUrl, conversionUrl]);

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

          {/* Layout 3-col em desktop: gráfico de vendas | lista de
              vendas | cards de performance — cada um ocupando 1/3.
              Altura fixa em desktop (lg:h-[380px]) — só a lista do meio
              tem scroll interno, os outros 2 ficam fixos. Em <lg empilha
              vertical e cada container tem altura livre. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:h-[380px]">
            <BarChart byMonth={data.byMonth} />
            <DealsList deals={data.deals} />
            {conversion ? (
              <ConversionCardsBlock conversion={conversion} />
            ) : (
              <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 text-white/40 text-sm">
                Carregando performance…
              </div>
            )}
          </div>

          {/* Gráfico de barras de Reuniões vs Ganhos vs Perdidos vs Congelados
              fica embaixo em largura total (chart se beneficia do
              horizontal). */}
          {conversion && (
            <div className="mt-3">
              <ConversionChart
                byMonth={conversion.byMonth}
                deals={conversion.deals}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

type DrillKey = "reunioes" | "ganhos" | "perdidos" | "congelados";
const DRILL_LABELS: Record<DrillKey, string> = {
  reunioes: "Reuniões realizadas",
  ganhos: "Negócios ganhos",
  perdidos: "Negócios perdidos",
  congelados: "Negócios congelados",
};

// Container 1/3 que reúne os 6 cards de Performance de Conversão.
// Visualmente espelha o tamanho/aparência do BarChart e do DealsList
// no layout 3-col em desktop.
function ConversionCardsBlock({
  conversion,
}: {
  conversion: ConversionResponse;
}) {
  const s = conversion.summary;
  const [drill, setDrill] = useState<DrillKey | null>(null);
  function pct(v: number): string {
    return `${(v * 100).toFixed(1).replace(".", ",")}%`;
  }
  return (
    <>
      <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 sm:p-4 flex flex-col lg:h-full">
        <h3 className="text-white text-sm font-medium mb-3 shrink-0">
          Performance de conversão
        </h3>
        {/* 2 cols × 3 rows = 6 cards. Os 4 absolutos primeiro, depois as
            2 taxas (Taxa de conversão é o padrão de vendas — vem primeiro). */}
        <div className="grid grid-cols-2 gap-2 flex-1 content-start">
          <InfoCard
            label="Reuniões realizadas"
            value={String(s.reunioesRealizadas)}
            accent="amber"
            onClick={() => setDrill("reunioes")}
            tooltipTitle="Reuniões realizadas no período"
            tooltipBody={
              <>
                Total de negócios <strong>criados</strong> no intervalo
                selecionado (DATE_CREATE). Todo deal começa na etapa
                "Reunião realizada". <em>Clique pra ver a lista.</em>
              </>
            }
          />
          <InfoCard
            label="Ganhos"
            value={String(s.ganhos)}
            accent="emerald"
            onClick={() => setDrill("ganhos")}
            tooltipTitle="Negócios ganhos"
            tooltipBody={
              <>
                Deals na etapa <strong>Negócio Ganho</strong> (WON) com
                CLOSEDATE no período. <em>Clique pra ver a lista.</em>
              </>
            }
          />
          <InfoCard
            label="Perdidos"
            value={String(s.perdidos)}
            accent="rose"
            onClick={() => setDrill("perdidos")}
            tooltipTitle="Negócios perdidos"
            tooltipBody={
              <>
                Deals na etapa <strong>Negócio Perdido</strong> (APOLOGY)
                com CLOSEDATE no período. <em>Clique pra ver a lista.</em>
              </>
            }
          />
          <InfoCard
            label="Congelados"
            value={String(s.congelados)}
            accent="sky"
            onClick={() => setDrill("congelados")}
            tooltipTitle="Negócios congelados"
            tooltipBody={
              <>
                Deals na etapa <strong>Congelado</strong> (LOSE) com
                CLOSEDATE no período. Não entram no cálculo da Taxa de
                fechamento. <em>Clique pra ver a lista.</em>
              </>
            }
          />
          <InfoCard
            label="Taxa de conversão"
            value={pct(s.taxaConversaoTotal)}
            accent="white"
            tooltipTitle="Taxa de conversão (padrão de vendas)"
            tooltipBody={
              <>
                <code className="text-emerald-300">
                  ganhos / reuniões realizadas
                </code>
                <br />
                = {s.ganhos} / {s.reunioesRealizadas} ={" "}
                <strong>{pct(s.taxaConversaoTotal)}</strong>
                <br />
                <br />
                Métrica padrão: de cada 100 reuniões, quantas viraram
                venda. Inclui pipeline em-aberto e congelados como
                "não-ganhos".
              </>
            }
          />
          <InfoCard
            label="Eficiência de fechamento"
            value={pct(s.taxaConversao)}
            accent="white"
            tooltipTitle="Eficiência de fechamento"
            tooltipBody={
              <>
                <code className="text-emerald-300">
                  ganhos / (ganhos + perdidos)
                </code>
                <br />
                = {s.ganhos} / ({s.ganhos} + {s.perdidos}) ={" "}
                <strong>{pct(s.taxaConversao)}</strong>
                <br />
                <br />
                Olha só pros deals <strong>decididos</strong>. Ignora
                pipeline em-aberto e congelados.
              </>
            }
          />
        </div>
      </div>

      {drill && (
        <DrillModal
          title={DRILL_LABELS[drill]}
          deals={conversion.deals[drill]}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function ConversionSection({ conversion }: { conversion: ConversionResponse }) {
  const s = conversion.summary;
  const [drill, setDrill] = useState<DrillKey | null>(null);
  function pct(v: number): string {
    return `${(v * 100).toFixed(1).replace(".", ",")}%`;
  }
  return (
    <>
      {/* Linha 1: counters absolutos — agora clicáveis pra drill-down */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
        <InfoCard
          label="Reuniões realizadas"
          value={String(s.reunioesRealizadas)}
          accent="amber"
          onClick={() => setDrill("reunioes")}
          tooltipTitle="Reuniões realizadas no período"
          tooltipBody={
            <>
              Total de negócios <strong>criados</strong> no intervalo
              selecionado (DATE_CREATE). Todo deal começa na etapa
              "Reunião realizada", então isso equivale a quantas reuniões
              voce realizou no período. <em>Clique pra ver a lista.</em>
            </>
          }
        />
        <InfoCard
          label="Ganhos"
          value={String(s.ganhos)}
          accent="emerald"
          onClick={() => setDrill("ganhos")}
          tooltipTitle="Negócios ganhos"
          tooltipBody={
            <>
              Deals na etapa <strong>Negócio Ganho</strong> (WON) com
              data de fechamento (CLOSEDATE) no período.{" "}
              <em>Clique pra ver a lista.</em>
            </>
          }
        />
        <InfoCard
          label="Perdidos"
          value={String(s.perdidos)}
          accent="rose"
          onClick={() => setDrill("perdidos")}
          tooltipTitle="Negócios perdidos"
          tooltipBody={
            <>
              Deals na etapa <strong>Negócio Perdido</strong> (APOLOGY)
              com data de fechamento no período.{" "}
              <em>Clique pra ver a lista.</em>
            </>
          }
        />
        <InfoCard
          label="Congelados"
          value={String(s.congelados)}
          accent="sky"
          onClick={() => setDrill("congelados")}
          tooltipTitle="Negócios congelados"
          tooltipBody={
            <>
              Deals na etapa <strong>Congelado</strong> (LOSE) com data
              de fechamento no período. Não entram no cálculo da Taxa
              de fechamento porque ainda podem voltar.{" "}
              <em>Clique pra ver a lista.</em>
            </>
          }
        />
      </div>

      {/* Linha 2: as duas taxas — mesma proeminência. O padrão da
          galera (ganhos/reuniões) vem primeiro pra ser o que bate o
          olho. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4">
        <InfoCard
          label="Taxa de conversão"
          value={pct(s.taxaConversaoTotal)}
          accent="white"
          tooltipTitle="Taxa de conversão (padrão de vendas)"
          tooltipBody={
            <>
              <code className="text-emerald-300">
                ganhos / reuniões realizadas
              </code>
              <br />
              = {s.ganhos} / {s.reunioesRealizadas} ={" "}
              <strong>{pct(s.taxaConversaoTotal)}</strong>
              <br />
              <br />
              É a métrica que time comercial costuma trackear: de cada
              100 reuniões que voce fez, quantas viraram venda. Conta os
              negócios ainda no pipeline e os congelados como "não-ganhos"
              pra ser conservadora.
            </>
          }
        />
        <InfoCard
          label="Eficiência de fechamento"
          value={pct(s.taxaConversao)}
          accent="white"
          tooltipTitle="Eficiência de fechamento"
          tooltipBody={
            <>
              <code className="text-emerald-300">
                ganhos / (ganhos + perdidos)
              </code>
              <br />
              = {s.ganhos} / ({s.ganhos} + {s.perdidos}) ={" "}
              <strong>{pct(s.taxaConversao)}</strong>
              <br />
              <br />
              Olha só pros deals que já foram <strong>decididos</strong> —
              ou ganhou ou explicitamente perdeu. Ignora os que ainda tão
              no pipeline e os congelados. Útil pra avaliar sua habilidade
              de fechamento <em>nos casos em que voce levou até o final</em>.
            </>
          }
        />
      </div>

      <ConversionChart byMonth={conversion.byMonth} />

      {drill && (
        <DrillModal
          title={DRILL_LABELS[drill]}
          deals={conversion.deals[drill]}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function DrillModal({
  title,
  deals,
  onClose,
}: {
  title: string;
  deals: ConvDealRef[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[#0e1422] border border-white/10 shadow-2xl w-full sm:max-w-xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[80vh] rounded-none sm:rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="safe-top px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              {title}
            </h2>
            <div className="text-[11px] text-white/50 mt-0.5">
              {deals.length} {deals.length === 1 ? "negócio" : "negócios"} no
              período
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white transition text-lg w-10 h-10 flex items-center justify-center -mr-2"
            title="Fechar"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {deals.length === 0 ? (
          <div className="px-5 py-10 text-center text-white/40 text-sm">
            Nenhum negócio nessa categoria no período.
          </div>
        ) : (
          <div className="overflow-y-auto col-scroll flex-1 divide-y divide-white/5">
            {deals.map((d) => (
              <a
                key={d.id}
                href={`https://turbopartners.bitrix24.com.br/crm/deal/details/${d.id}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 flex items-center gap-3 hover:bg-white/[0.03] transition group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[13px] truncate group-hover:text-sky-300 transition">
                    {d.title}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-white/40 tabular-nums">
                  {d.date || "—"}
                </div>
                <div className="shrink-0 text-[10px] text-white/30 group-hover:text-sky-400 transition">
                  ↗
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="px-5 py-3 bg-white/[0.03] border-t border-white/10 flex justify-end shrink-0 safe-bottom">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white rounded-md transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// Card com tooltip on-hover. Pode ser clicável (drill-down) — quando
// onClick é passado, o card vira <button> com cursor-pointer e hover
// visual.
function InfoCard({
  label,
  value,
  accent,
  tooltipTitle,
  tooltipBody,
  onClick,
}: {
  label: string;
  value: string;
  accent: "sky" | "emerald" | "white" | "amber" | "rose";
  tooltipTitle: string;
  tooltipBody: React.ReactNode;
  onClick?: () => void;
}) {
  const accentColors: Record<string, string> = {
    sky: "text-sky-400",
    emerald: "text-emerald-400",
    white: "text-white",
    amber: "text-amber-400",
    rose: "text-rose-400",
  };
  const interactive = !!onClick;
  const Wrap: any = interactive ? "button" : "div";
  return (
    <Wrap
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={`text-left bg-white/[0.04] border border-white/10 rounded-lg p-3 relative group ${
        interactive
          ? "cursor-pointer hover:bg-white/[0.07] hover:border-white/20 transition"
          : "cursor-help"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <div className="text-[10px] sm:text-[11px] text-white/50 uppercase tracking-wide font-medium">
          {label}
        </div>
        <svg
          className="w-3 h-3 text-white/30 group-hover:text-white/60 transition"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM7.5 7v4h1V7h-1zm.5-2.25a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
        </svg>
      </div>
      <div
        className={`mt-1 text-base sm:text-lg font-semibold ${accentColors[accent]}`}
      >
        {value}
      </div>

      <div className="pointer-events-none absolute z-20 left-0 right-0 sm:right-auto sm:left-0 sm:w-72 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition shadow-xl">
        <div className="bg-slate-900 border border-white/20 text-white rounded-lg p-3 text-[12px] leading-relaxed">
          <div className="font-semibold mb-1 text-white">{tooltipTitle}</div>
          <div className="text-white/80">{tooltipBody}</div>
        </div>
      </div>
    </Wrap>
  );
}

// Filtra um array de deals por mês (date no formato DD/MM/YYYY) → bate
// com o key YYYY-MM do bucket do chart.
function filterDealsByMonth(
  deals: ConvDealRef[],
  monthKey: string
): ConvDealRef[] {
  const [yy, mm] = monthKey.split("-");
  return deals.filter((d) => {
    const parts = d.date.split("/");
    if (parts.length !== 3) return false;
    return parts[1] === mm && parts[2] === yy;
  });
}

const PT_MONTH_LONG_DASH = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function ConversionChart({
  byMonth,
  deals,
}: {
  byMonth: ConvMonthBucket[];
  deals?: ConversionResponse["deals"];
}) {
  // Recorte: só meses a partir de 2026-04 (deals anteriores estavam num
  // pipeline diferente / pré-padronização — Roberto pediu pra cortar).
  const filtered = useMemo(
    () => byMonth.filter((b) => b.month >= "2026-04"),
    [byMonth]
  );
  // Normaliza pelo pico entre as 4 séries
  const max = useMemo(() => {
    let m = 0;
    for (const b of filtered) {
      m = Math.max(
        m,
        b.reunioesRealizadas,
        b.ganhos,
        b.perdidos,
        b.congelados
      );
    }
    return m || 1;
  }, [filtered]);

  // Drill local — clicar numa barra abre um modal só com os deals
  // daquela categoria + daquele mês.
  const [drill, setDrill] = useState<{
    key: DrillKey;
    month: string;
  } | null>(null);

  function openDrill(key: DrillKey, month: string) {
    if (!deals) return;
    setDrill({ key, month });
  }
  function drillTitle(key: DrillKey, monthKey: string): string {
    const [yy, mm] = monthKey.split("-");
    const monthName = PT_MONTH_LONG_DASH[parseInt(mm, 10) - 1] || mm;
    return `${DRILL_LABELS[key]} — ${monthName}/${yy}`;
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 text-center text-white/40 text-sm">
        Sem dados de abril/2026 em diante para esse período.
      </div>
    );
  }

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-white/80 text-sm font-medium">
          Reuniões vs Ganhos vs Perdidos vs Congelados (mês a mês, abr/2026+)
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-white/60 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Reuniões
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Ganhos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Perdidos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Congelados
          </span>
        </div>
      </div>

      {/* gap-5/6 dá ar entre os meses; cada bucket de mês é um <div com
          gap-1 entre suas 4 barras internas — assim as barras DO MESMO
          MÊS ficam juntinhas mas meses diferentes ficam visivelmente
          separados. */}
      <div className="flex items-end gap-5 sm:gap-6 h-56 overflow-x-auto col-scroll pb-2 pt-6 px-1">
        {filtered.map((b) => {
          const hR = (b.reunioesRealizadas / max) * 100;
          const hG = (b.ganhos / max) * 100;
          const hP = (b.perdidos / max) * 100;
          const hC = (b.congelados / max) * 100;
          return (
            <div
              key={b.month}
              className="flex-1 min-w-[68px] flex flex-col items-stretch h-full"
              title={`${formatMonthLabel(b.month)} — Reuniões: ${b.reunioesRealizadas} | Ganhos: ${b.ganhos} | Perdidos: ${b.perdidos} | Congelados: ${b.congelados}`}
            >
              {/* Cada barra é um <button> — clicar abre o drill da
                  categoria + mês específico. Barras com count > 0
                  ficam clicáveis; barras de zero são display-only. */}
              <div className="flex-1 flex items-end gap-1">
                <BarButton
                  height={Math.max(hR, b.reunioesRealizadas > 0 ? 2 : 0)}
                  count={b.reunioesRealizadas}
                  barClass="bg-amber-500/80 hover:bg-amber-500"
                  textClass="text-amber-300"
                  label={`Reuniões em ${formatMonthLabel(b.month)}`}
                  onClick={() => openDrill("reunioes", b.month)}
                  disabled={!deals || b.reunioesRealizadas === 0}
                />
                <BarButton
                  height={Math.max(hG, b.ganhos > 0 ? 2 : 0)}
                  count={b.ganhos}
                  barClass="bg-emerald-500/80 hover:bg-emerald-500"
                  textClass="text-emerald-300"
                  label={`Ganhos em ${formatMonthLabel(b.month)}`}
                  onClick={() => openDrill("ganhos", b.month)}
                  disabled={!deals || b.ganhos === 0}
                />
                <BarButton
                  height={Math.max(hP, b.perdidos > 0 ? 2 : 0)}
                  count={b.perdidos}
                  barClass="bg-rose-500/80 hover:bg-rose-500"
                  textClass="text-rose-300"
                  label={`Perdidos em ${formatMonthLabel(b.month)}`}
                  onClick={() => openDrill("perdidos", b.month)}
                  disabled={!deals || b.perdidos === 0}
                />
                <BarButton
                  height={Math.max(hC, b.congelados > 0 ? 2 : 0)}
                  count={b.congelados}
                  barClass="bg-sky-500/80 hover:bg-sky-500"
                  textClass="text-sky-300"
                  label={`Congelados em ${formatMonthLabel(b.month)}`}
                  onClick={() => openDrill("congelados", b.month)}
                  disabled={!deals || b.congelados === 0}
                />
              </div>
              <div className="text-center text-[10px] text-white/50 mt-1 truncate">
                {formatMonthLabel(b.month)}
              </div>
            </div>
          );
        })}
      </div>

      {drill && deals && (
        <DrillModal
          title={drillTitle(drill.key, drill.month)}
          deals={filterDealsByMonth(deals[drill.key], drill.month)}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

// Botão de barra clicável usado no ConversionChart. Quando count > 0
// e tem drill habilitado, hover destaca. Senão é só display.
function BarButton({
  height,
  count,
  barClass,
  textClass,
  label,
  onClick,
  disabled,
}: {
  height: number;
  count: number;
  barClass: string;
  textClass: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex-1 rounded-t-sm relative transition ${barClass} ${
        disabled
          ? "cursor-default"
          : "cursor-pointer hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/40"
      }`}
      style={{ height: `${height}%` }}
    >
      {count > 0 && (
        <div
          className={`absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] ${textClass} font-medium pointer-events-none`}
        >
          {count}
        </div>
      )}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "sky" | "emerald" | "white" | "amber" | "rose";
}) {
  const accentColors: Record<string, string> = {
    sky: "text-sky-400",
    emerald: "text-emerald-400",
    white: "text-white",
    amber: "text-amber-400",
    rose: "text-rose-400",
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
  // Recorte: só meses a partir de abril/2026 (alinhado ao chart de
  // conversão — mesma decisão de Roberto).
  const filtered = useMemo(
    () => byMonth.filter((b) => b.month >= "2026-04"),
    [byMonth]
  );
  // Pega o pico geral pra normalizar as alturas.
  const max = useMemo(() => {
    let m = 0;
    for (const b of filtered) {
      m = Math.max(m, b.recurring, b.pontual);
    }
    return m || 1;
  }, [filtered]);

  // Formatador compacto pros valores que ficam acima das barras
  // (R$ 28.997 → "29K", R$ 1.500.000 → "1,5M"). Mantém o eixo X limpo
  // sem que valores grandes quebrem o layout.
  function compactBRL(v: number): string {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace(".", ",")}M`;
    if (v >= 1000) return `${Math.round(v / 1000)}K`;
    return String(Math.round(v));
  }

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 sm:p-4 flex flex-col lg:h-full">
      <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
        <h3 className="text-white text-sm font-medium">
          Vendas mês a mês <span className="text-white/40">(abr/2026+)</span>
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Valor R
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Valor P
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
          Sem dados de abril/2026 em diante para esse período.
        </div>
      ) : (
      /* gap maior entre meses pra não grudar. flex-1 ocupa altura total
         do container; sem padding inferior — label do mês já tem mt-1
         suficiente. */
      <div className="flex items-end gap-4 sm:gap-5 flex-1 overflow-x-auto col-scroll pb-0 pt-6 px-1">
        {filtered.map((b) => {
          const hR = (b.recurring / max) * 100;
          const hP = (b.pontual / max) * 100;
          return (
            <div
              key={b.month}
              className="flex-1 min-w-[56px] flex flex-col items-stretch h-full"
              title={`${formatMonthLabel(b.month)} — R: ${formatBRL(b.recurring)} | P: ${formatBRL(b.pontual)} | ${b.count} venda(s)`}
            >
              <div className="flex-1 flex items-end gap-1">
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
      )}
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
    <div className="bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden flex flex-col lg:h-full">
      <div className="px-4 py-3 border-b border-white/10 text-white text-sm font-medium shrink-0">
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
              className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition"
            >
              <div className="flex-1 min-w-0">
                <div className="text-white text-[14px] truncate font-medium">
                  {d.title}
                </div>
                <div className="text-white/50 text-[12px] mt-0.5">{dtLabel}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[12px] text-sky-400 font-medium">
                  R {formatBRL(d.recurring)}
                </div>
                <div className="text-[12px] text-emerald-400 font-medium">
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
