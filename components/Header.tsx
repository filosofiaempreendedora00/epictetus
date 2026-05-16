"use client";

import { useState } from "react";

const tabs = ["Kanban", "Lista", "Atividades", "Calendário"] as const;

export default function Header() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Kanban");
  const [search, setSearch] = useState("");

  return (
    <header className="px-6 pt-6 pb-3">
      {/* Top row: title + filters + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-semibold text-white">Negócios</h1>
          <button
            className="text-white/40 hover:text-white/70 transition"
            title="Fixar"
            aria-label="Fixar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 4l4 4-6 2-2 6-4-4-4 6 2-6-4-4 6-2L10 0z" opacity="0.7" />
            </svg>
          </button>
        </div>

        <button className="ml-2 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium px-3 py-2 rounded-lg transition shadow-md shadow-emerald-500/20">
          <span className="text-base leading-none">+</span> Criar
          <span className="opacity-60">▾</span>
        </button>

        <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/90 text-sm px-3 py-2 rounded-lg transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          Pipeline Commerce
          <span className="bg-red-500/90 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
            15
          </span>
          <span className="opacity-60">▾</span>
        </button>

        <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/90 text-sm px-3 py-2 rounded-lg transition">
          Pipe - Roberto
          <span className="opacity-50 hover:opacity-100">✕</span>
        </button>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="pesquisa"
          className="flex-1 min-w-[200px] bg-transparent border-b border-white/10 focus:border-white/30 outline-none text-white/90 placeholder:text-white/40 px-2 py-2 text-sm"
        />
      </div>

      {/* Second row: tabs + status pills + action buttons */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-sm px-3 py-1.5 rounded-md transition ${
                activeTab === tab
                  ? "text-white font-medium"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="ml-2 flex items-center gap-2">
          <StatusPill color="bg-emerald-500" label="Recebidos" count={2} />
          <StatusPill color="bg-red-500" label="Planejado" count={13} />
          <StatusPill color="bg-white/10" label="Mais" count={95} caret />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/80 text-sm px-3 py-1.5 rounded-md transition">
            <span className="text-emerald-400">⟲</span> Vendas recorrentes
          </button>
          <button className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 text-white/80 text-sm px-3 py-1.5 rounded-md transition">
            <span className="text-emerald-400">🤖</span> Regras d…
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusPill({
  color,
  label,
  count,
  caret,
}: {
  color: string;
  label: string;
  count: number;
  caret?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full pl-1 pr-3 py-1">
      <span
        className={`${color} text-white text-xs font-semibold rounded-full min-w-[28px] h-6 px-2 flex items-center justify-center`}
      >
        {count}
      </span>
      <span className="text-sm text-white/80">{label}</span>
      {caret && <span className="text-white/50 text-xs">▾</span>}
    </div>
  );
}
