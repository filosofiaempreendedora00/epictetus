"use client";

import { useEffect, useState } from "react";
import { useRoute, type ViewMode } from "@/lib/route";

type Item = {
  key: string;
  label: string;
  icon: string;
  available: boolean;
  // Se a sidebar deve marcar esse item como ativo, dado o viewMode atual
  matches?: (view: ViewMode) => boolean;
  // Pra onde navegar quando clicar
  navigateTo?: ViewMode;
};

const items: Item[] = [
  {
    key: "kanban",
    label: "Kanban",
    icon: "▦",
    available: true,
    // Kanban cobre os 3 sub-modos do board (negócios/tarefas/reuniões).
    matches: (v) => v === "negocios" || v === "tarefas" || v === "reunioes",
    navigateTo: "negocios",
  },
  {
    key: "congelados",
    label: "Pipeline de Congelados",
    icon: "❄️",
    available: true,
    matches: (v) => v === "congelados",
    navigateTo: "congelados",
  },
  {
    key: "dash",
    label: "Dashboard",
    icon: "📊",
    available: true,
    matches: (v) => v === "dash",
    navigateTo: "dash",
  },
  {
    key: "scripts",
    label: "Scripts prontos de mensagens",
    icon: "💬",
    available: false,
  },
];

const STORAGE_KEY = "epictetus.sidebar.expanded";

export default function Sidebar() {
  const { route, setRoute } = useRoute();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setExpanded(true);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <aside
      className={`hidden md:flex shrink-0 border-r border-white/5 bg-white/[0.02] flex-col py-4 gap-1 transition-[width] duration-200 ease-out ${
        expanded ? "w-[220px] px-3" : "w-[56px] px-2"
      }`}
    >
      <button
        onClick={toggle}
        className="w-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.06] rounded-lg py-2 transition"
        title={expanded ? "Recolher menu" : "Expandir menu"}
        aria-label={expanded ? "Recolher menu" : "Expandir menu"}
      >
        <span className="text-lg leading-none">{expanded ? "‹‹" : "››"}</span>
      </button>

      {expanded && (
        <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-white/40">
          Ambientes
        </div>
      )}

      {items.map((item) => {
        const isActive = item.matches ? item.matches(route.view) : false;
        const clickable = item.available && !!item.navigateTo;
        return (
          <button
            key={item.key}
            disabled={!item.available}
            onClick={() => {
              if (clickable && item.navigateTo) {
                setRoute({ view: item.navigateTo });
              }
            }}
            className={`w-full flex items-center gap-2.5 rounded-lg text-sm text-left transition ${
              expanded ? "px-3 py-2.5" : "justify-center px-0 py-2.5"
            } ${
              isActive
                ? "bg-white/10 text-white font-medium"
                : clickable
                ? "text-white/70 hover:bg-white/[0.06] hover:text-white"
                : "text-white/30 cursor-not-allowed"
            }`}
            title={!expanded ? item.label : item.available ? undefined : "Em breve"}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {expanded && (
              <>
                <span className="flex-1 leading-tight">{item.label}</span>
                {!item.available && (
                  <span className="text-[10px] uppercase tracking-wide bg-white/10 text-white/50 px-1.5 py-0.5 rounded">
                    em breve
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </aside>
  );
}
