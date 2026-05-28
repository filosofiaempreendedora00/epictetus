"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TaskType } from "./taskTypes";

// =============================================================================
// Esquema de rotas em PORTUGUÊS (paths semânticos pra deep linking via voz)
// =============================================================================
//
// Navegação principal:
//   /                                  → home (= /negocios)
//   /negocios                          → kanban dos negócios
//   /negocios/<nome-do-cliente>        → abre modal de editar daquele cliente
//
// Tarefas:
//   /tarefas                           → semanal, todos (default)
//   /tarefas/semanal | duas-semanas | mensal
//   /tarefas/<periodo>/<filtro>        → fup | r2-r3 | criar-proposta | outro
//
//   /tarefas/nova                      → modal nova tarefa
//   /tarefas/nova/<dia>                → ex.: /tarefas/nova/amanha
//   /tarefas/nova/<cliente>            → ex.: /tarefas/nova/luma
//   /tarefas/nova/<dia>/<cliente>      → ex.: /tarefas/nova/amanha/luma
//
// Search params (acessórios):
//   ?busca=<texto>                     → filtra negócios/tarefas por texto
//   ?semana=N                          → offset numérico de semanas (em /tarefas)
//
// Granularidade desenhada pra comandos como:
//   "Negócios"                    → /negocios
//   "Abrir Luma"                  → /negocios/luma
//   "Tarefas duas semanas FUP"    → /tarefas/duas-semanas/fup
//   "Próxima semana"              → adiciona ?semana=1
//   "Criar tarefa amanhã"         → /tarefas/nova/amanha
//   "Criar tarefa amanhã do Luma" → /tarefas/nova/amanha/luma
//
// Reuniões (Google Agenda):
//   /reunioes                          → semanal (default)
//   /reunioes/semanal | duas-semanas
//   "Reuniões duas semanas"            → /reunioes/duas-semanas
//
// Dashboard (vendas do Roberto, etapa Negócio Ganho):
//   /dash                              → últimos 12 meses
//   /dash/<ano>                        → ex.: /dash/2026 = ano calendário
//   ?de=YYYY-MM-DD&ate=YYYY-MM-DD      → range customizado (sobrepõe path)
//   "Dashboard"                        → /dash
//   "Dashboard 2025"                   → /dash/2025

export type ViewMode = "negocios" | "tarefas" | "reunioes" | "dash";
export type DateView = "weekly" | "biweekly" | "monthly";
export type TypeFilter = "ALL" | TaskType;
export type ModalKind = "editarNegocio" | "novaTarefa" | null;

export type AppRoute = {
  view: ViewMode;
  dateView: DateView;
  typeFilter: TypeFilter;
  modal: ModalKind;
  cliente: string;      // nome do negócio (cru, lowercase para match)
  dia: string;          // hoje | amanha | ontem | YYYY-MM-DD | ""
  busca: string;        // texto de busca
  weekOffset: number;   // ?semana=N
  // Dashboard (só aplicável quando view === "dash"):
  dashAno: number | null;   // /dash/<ano> ou null pra "últimos 12 meses"
  dashMes: string;          // ?mes=YYYY-MM (mês específico)
  dashDe: string;           // ?de=YYYY-MM-DD (range customizado)
  dashAte: string;          // ?ate=YYYY-MM-DD
};

const PERIODO_TO_DATEVIEW: Record<string, DateView> = {
  semanal: "weekly",
  "duas-semanas": "biweekly",
  mensal: "monthly",
};
const DATEVIEW_TO_PERIODO: Record<DateView, string> = {
  weekly: "semanal",
  biweekly: "duas-semanas",
  monthly: "mensal",
};

const FILTER_FROM_SEGMENT: Record<string, TypeFilter> = {
  fup: "FUP",
  "r2-r3": "R2R3",
  "criar-proposta": "PROPOSTA",
  outro: "OUTRO",
};
const FILTER_TO_SEGMENT: Record<Exclude<TypeFilter, "ALL">, string> = {
  FUP: "fup",
  R2R3: "r2-r3",
  PROPOSTA: "criar-proposta",
  OUTRO: "outro",
};

function isDiaSegment(s: string): boolean {
  return /^(hoje|amanha|amanhã|ontem|\d{4}-\d{2}-\d{2})$/i.test(s);
}

function slugifyClient(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EMPTY_ROUTE: AppRoute = {
  view: "negocios",
  dateView: "weekly",
  typeFilter: "ALL",
  modal: null,
  cliente: "",
  dia: "",
  busca: "",
  weekOffset: 0,
  dashAno: null,
  dashMes: "",
  dashDe: "",
  dashAte: "",
};

export function parseRoute(
  pathname: string,
  searchParams: URLSearchParams
): AppRoute {
  const route: AppRoute = {
    ...EMPTY_ROUTE,
    busca: searchParams.get("busca") || "",
    weekOffset: parseInt(searchParams.get("semana") || "0", 10) || 0,
    dashMes: searchParams.get("mes") || "",
    dashDe: searchParams.get("de") || "",
    dashAte: searchParams.get("ate") || "",
  };

  const segs = pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (segs.length === 0) {
    // /
    return route;
  }

  if (segs[0] === "negocios") {
    route.view = "negocios";
    if (segs[1]) {
      route.modal = "editarNegocio";
      route.cliente = segs[1];
    }
    return route;
  }

  if (segs[0] === "tarefas") {
    route.view = "tarefas";

    if (segs[1] === "nova") {
      route.modal = "novaTarefa";
      const a = segs[2];
      const b = segs[3];
      if (a && isDiaSegment(a)) {
        route.dia = a.toLowerCase();
        if (b) route.cliente = b;
      } else if (a) {
        route.cliente = a;
      }
      return route;
    }

    if (segs[1] && PERIODO_TO_DATEVIEW[segs[1]]) {
      route.dateView = PERIODO_TO_DATEVIEW[segs[1]];
      if (segs[2] && FILTER_FROM_SEGMENT[segs[2]]) {
        route.typeFilter = FILTER_FROM_SEGMENT[segs[2]];
      }
    }
    return route;
  }

  if (segs[0] === "reunioes") {
    route.view = "reunioes";
    // Reuniões só usa weekly/biweekly (mensal não faz sentido pra Meet).
    if (segs[1] && PERIODO_TO_DATEVIEW[segs[1]]) {
      route.dateView = PERIODO_TO_DATEVIEW[segs[1]];
    }
    return route;
  }

  if (segs[0] === "dash") {
    route.view = "dash";
    // /dash/<ano> ex.: /dash/2026 → filtra ano calendário
    if (segs[1]) {
      const yr = parseInt(segs[1], 10);
      if (Number.isFinite(yr) && yr >= 2000 && yr <= 2100) {
        route.dashAno = yr;
      }
    }
    return route;
  }

  return route;
}

export function buildRoute(route: AppRoute): string {
  const segs: string[] = [];

  if (route.view === "negocios") {
    if (route.modal === "editarNegocio" && route.cliente) {
      segs.push("negocios", slugifyClient(route.cliente));
    }
    // / é o default; só explicitamos /negocios quando há cliente
  } else if (route.view === "tarefas") {
    segs.push("tarefas");

    if (route.modal === "novaTarefa") {
      segs.push("nova");
      if (route.dia) segs.push(route.dia);
      if (route.cliente) segs.push(slugifyClient(route.cliente));
    } else {
      // Período e filtro
      const isPeriodoDefault = route.dateView === "weekly";
      const isFilterDefault = route.typeFilter === "ALL";
      if (!isPeriodoDefault || !isFilterDefault) {
        segs.push(DATEVIEW_TO_PERIODO[route.dateView]);
        if (!isFilterDefault) {
          segs.push(FILTER_TO_SEGMENT[route.typeFilter as Exclude<TypeFilter, "ALL">]);
        }
      }
    }
  } else if (route.view === "reunioes") {
    segs.push("reunioes");
    // Só explicita o período quando não for o default (weekly).
    if (route.dateView !== "weekly") {
      segs.push(DATEVIEW_TO_PERIODO[route.dateView]);
    }
  } else if (route.view === "dash") {
    segs.push("dash");
    if (route.dashAno) segs.push(String(route.dashAno));
  }

  const pathname = segs.length ? `/${segs.join("/")}` : "/";

  const sp = new URLSearchParams();
  if (route.busca) sp.set("busca", route.busca);
  if (route.weekOffset && route.weekOffset !== 0)
    sp.set("semana", String(route.weekOffset));
  if (route.dashMes) sp.set("mes", route.dashMes);
  if (route.dashDe) sp.set("de", route.dashDe);
  if (route.dashAte) sp.set("ate", route.dashAte);

  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function useRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const route = useMemo(
    () => parseRoute(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams]
  );

  const setRoute = useCallback(
    (patch: Partial<AppRoute>) => {
      const next: AppRoute = { ...route, ...patch };
      router.replace(buildRoute(next), { scroll: false });
    },
    [route, router]
  );

  return { route, setRoute };
}

// Helpers reaproveitados pra abrir modais via path (em vez de query params)
export function openEditarNegocio(cliente: string): Partial<AppRoute> {
  return { view: "negocios", modal: "editarNegocio", cliente };
}

export function openNovaTarefa(opts?: {
  dia?: string | null;
  cliente?: string | null;
}): Partial<AppRoute> {
  return {
    view: "tarefas",
    modal: "novaTarefa",
    dia: opts?.dia || "",
    cliente: opts?.cliente || "",
  };
}

export function closeModal(): Partial<AppRoute> {
  return { modal: null, cliente: "", dia: "" };
}
